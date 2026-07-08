-- 0001_foundations
-- Be Care Compliant foundations: companies, branches, profiles/roles,
-- single-session enforcement, RLS helper functions.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
-- Applied via Supabase MCP on 2026-07-07.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tier text not null default 'business'
    check (tier in ('business', 'pro', 'enterprise', 'diamond', 'black')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text not null default 'branch' check (kind in ('team', 'branch')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index branches_company_id_idx on public.branches (company_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null default '',
  email text not null,
  role text not null default 'team_member'
    check (role in ('platform_admin', 'company_admin', 'manager', 'supervisor', 'team_member')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The Founder / Platform Admin belongs to no tenant company.
  constraint platform_admin_has_no_company
    check (role <> 'platform_admin' or company_id is null)
);

create index profiles_company_id_idx on public.profiles (company_id);

-- Single-session enforcement: exactly one active session per user.
create table public.user_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  signed_in_at timestamptz not null default now(),
  user_agent text
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helper functions (security definer, search_path pinned)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'platform_admin'
      and p.status = 'active'
  );
$$;

create or replace function public.is_company_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.status = 'active'
  );
$$;

create or replace function public.is_company_admin(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.role = 'company_admin'
      and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile creation on signup (invite-only flow populates auth.users)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Protect privileged profile fields (role, company, status) at the database
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_protected_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service role / direct SQL (no JWT) bypasses: auth.uid() is null.
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.company_id is distinct from old.company_id
      or new.status is distinct from old.status) then
    if not (
      public.is_platform_admin()
      or (old.company_id is not null and public.is_company_admin(old.company_id))
    ) then
      raise exception 'Not allowed to change role, company or status';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row execute function public.enforce_profile_protected_fields();

-- ---------------------------------------------------------------------------
-- Single-session claim RPC (idempotent; guarded by record ownership)
-- ---------------------------------------------------------------------------

create or replace function public.claim_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_sessions (user_id, session_id, signed_in_at)
  values (auth.uid(), p_session_id, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id,
        signed_in_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.user_sessions enable row level security;

-- companies
create policy companies_select on public.companies
  for select using (public.is_company_member(id) or public.is_platform_admin());

create policy companies_insert on public.companies
  for insert with check (public.is_platform_admin());

create policy companies_update on public.companies
  for update
  using (public.is_company_admin(id) or public.is_platform_admin())
  with check (public.is_company_admin(id) or public.is_platform_admin());

create policy companies_delete on public.companies
  for delete using (public.is_platform_admin());

-- branches
create policy branches_select on public.branches
  for select using (public.is_company_member(company_id) or public.is_platform_admin());

create policy branches_insert on public.branches
  for insert with check (public.is_company_admin(company_id) or public.is_platform_admin());

create policy branches_update on public.branches
  for update
  using (public.is_company_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_admin(company_id) or public.is_platform_admin());

create policy branches_delete on public.branches
  for delete using (public.is_company_admin(company_id) or public.is_platform_admin());

-- profiles
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_platform_admin()
    or (company_id is not null and public.is_company_admin(company_id))
  );

create policy profiles_update on public.profiles
  for update
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or (company_id is not null and public.is_company_admin(company_id))
  )
  with check (
    id = auth.uid()
    or public.is_platform_admin()
    or (company_id is not null and public.is_company_admin(company_id))
  );

create policy profiles_insert on public.profiles
  for insert with check (public.is_platform_admin());

create policy profiles_delete on public.profiles
  for delete using (public.is_platform_admin());

-- user_sessions: readable by owner (and platform admin); writes ONLY via claim_session
create policy user_sessions_select on public.user_sessions
  for select using (user_id = auth.uid() or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers.
-- ---------------------------------------------------------------------------

alter table public.companies replica identity full;
alter table public.branches replica identity full;
alter table public.profiles replica identity full;
