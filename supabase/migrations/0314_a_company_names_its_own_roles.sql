-- 0314_a_company_names_its_own_roles
--
-- Phil, 2026-09-21: "lets add the roles to users and access, called that setting tile Roles,
-- users and access" -- the second half of what he asked for on 2026-09-21 ("both, in that
-- order"): first the two Settings screens joined, now a company making a role of its own.
--
-- WHAT A CUSTOM ROLE IS, AND WHAT IT IS NOT. It is a NAMED NARROWING of a built-in role. A
-- company names it, says which built-in role it copies, and unticks departments it must not
-- reach. It can never reach further than the role it copies.
--
-- WHY IT CANNOT GRANT, and why that is not a limitation we could code around in an afternoon:
-- every policy in this database names roles -- `role in ('manager','supervisor',...)`. A role
-- called "Care Coordinator" is a name the database has never heard of, so a person carrying it
-- would be refused everywhere. So the person KEEPS the built-in role in profiles.role, which is
-- what RLS reads and what decides their branch reach, and carries the custom role beside it as a
-- label and a narrowing. Nothing about RLS changes, and a mis-click still cannot expose a record
-- -- the same bargain as 0291, which this builds on.
--
-- A tick that could GRANT would mean every policy reading a table instead of naming a role: a
-- rewrite of the security model, not a settings screen. It is written down here so that whoever
-- reads this next does not think it was forgotten.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- The roles a company has made.
-- ===========================================================================
create table if not exists public.company_roles (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 2 and 40),
  /*
   * WHICH BUILT-IN IT COPIES. Fixed at creation and never edited: changing it would silently
   * change what every person on that role can reach, and the screen that did it would look like
   * a rename. To move people, make the other role and move them across, which is visible.
   *
   * NOT company_admin or platform_admin: an Admin owns Settings, and a narrowed Admin is the
   * lockout isLocked() exists to prevent. NOT staff: a carer's portal is its own tile.
   */
  base_role  text not null check (base_role in (
    'registered_individual', 'registered_manager', 'manager',
    'supervisor', 'recruiter', 'on_call', 'team_member'
  )),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

comment on table public.company_roles is
  'A role a company has named for itself: a narrowing of a built-in role. profiles.role still carries the built-in role, which is what RLS reads; this carries the name and the departments switched off.';

-- One name per company, however it is capitalised: "Care Coordinator" and "care coordinator"
-- are the same role to everybody who works there.
create unique index if not exists company_roles_name_idx
  on public.company_roles (company_id, lower(btrim(name)));

alter table public.company_roles enable row level security;

-- Everybody in the company READS them, for the same reason as company_role_modules: a name shown
-- beside a colleague, and the nav for the person looking at it, both need the row. There is
-- nothing sensitive in one -- a name and a role.
drop policy if exists company_roles_select on public.company_roles;
create policy company_roles_select on public.company_roles
  for select using (is_company_member(company_id));

drop policy if exists company_roles_write on public.company_roles;
create policy company_roles_write on public.company_roles
  for all
  using (is_platform_admin() or is_company_admin(company_id))
  with check (is_platform_admin() or is_company_admin(company_id));

-- ===========================================================================
-- What each custom role has switched OFF. Absence means on, exactly as 0291.
-- ===========================================================================
create table if not exists public.company_role_modules_off (
  company_role_id uuid not null references public.company_roles(id) on delete cascade,
  module_key      text not null,
  disabled_at     timestamptz not null default now(),
  disabled_by     uuid references public.profiles(id) on delete set null,
  primary key (company_role_id, module_key)
);

comment on table public.company_role_modules_off is
  'One row per department a custom role has switched OFF. Absence means on. It can only narrow beneath the ceiling of the built-in role it copies (lib/auth/module-catalogue.ts).';

alter table public.company_role_modules_off enable row level security;

drop policy if exists company_role_modules_off_select on public.company_role_modules_off;
create policy company_role_modules_off_select on public.company_role_modules_off
  for select using (
    exists (
      select 1 from public.company_roles cr
      where cr.id = company_role_modules_off.company_role_id
        and is_company_member(cr.company_id)
    )
  );

drop policy if exists company_role_modules_off_write on public.company_role_modules_off;
create policy company_role_modules_off_write on public.company_role_modules_off
  for all
  using (
    exists (
      select 1 from public.company_roles cr
      where cr.id = company_role_modules_off.company_role_id
        and (is_platform_admin() or is_company_admin(cr.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.company_roles cr
      where cr.id = company_role_modules_off.company_role_id
        and (is_platform_admin() or is_company_admin(cr.company_id))
    )
  );

-- ===========================================================================
-- Who is on one. RESTRICT, not cascade: deleting a role people are using would
-- quietly hand them back everything it had switched off, so the database
-- refuses and the screen says how many people to move first.
-- ===========================================================================
alter table public.profiles
  add column if not exists company_role_id uuid references public.company_roles(id) on delete restrict;
alter table public.invites
  add column if not exists company_role_id uuid references public.company_roles(id) on delete restrict;

create index if not exists profiles_company_role_idx on public.profiles (company_role_id)
  where company_role_id is not null;

comment on column public.profiles.company_role_id is
  'The company''s own role this person carries, if any. profiles.role still holds the built-in role it copies, and that is what RLS reads.';

-- ===========================================================================
-- The two must never disagree.
--
-- A custom role that named a different company, or that copied a different built-in role from
-- the one in profiles.role, would be a person whose screen and whose permissions came from two
-- different places -- which is the whole class of defect DEF-023, 028, 031 and 032 were.
-- ===========================================================================
create or replace function public.company_role_matches_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
  v_base    text;
begin
  if new.company_role_id is null then
    return new;
  end if;
  select cr.company_id, cr.base_role into v_company, v_base
    from public.company_roles cr where cr.id = new.company_role_id;
  if v_company is null then
    raise exception 'That role does not exist.';
  end if;
  if v_company is distinct from new.company_id then
    raise exception 'That role belongs to another company.';
  end if;
  if v_base is distinct from new.role then
    raise exception 'A % role cannot be given to somebody whose role is %.', v_base, new.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_company_role_matches on public.profiles;
create trigger profiles_company_role_matches
  before insert or update of company_role_id, role, company_id on public.profiles
  for each row execute function public.company_role_matches_profile();

drop trigger if exists invites_company_role_matches on public.invites;
create trigger invites_company_role_matches
  before insert or update of company_role_id, role, company_id on public.invites
  for each row execute function public.company_role_matches_profile();
