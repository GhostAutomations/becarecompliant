-- 0338_senior_a_built_in_role
-- Phil, 2026-09-29: "I want senior to be a default role and all they should be able to see is a
-- list of people's names basically ... in role access there should be a role called senior".
-- Popup decisions: names from their own branch(es) only; the Senior tile in Role access has
-- People and Service Users ticks deciding which name lists they see; they keep their own carer
-- portal; and a Senior is NOT a paid user.
--
-- WHAT A SENIOR IS IN THE DATABASE: a carer's login (like 'staff') that may also read a list of
-- NAMES. Nothing more.
--   * profiles.role and invites.role accept 'senior'.
--   * is_staff() now means "a carer's own login", staff OR senior, so every "NOT is_staff()"
--     restriction a carer already has (company policies, other people's evidence) holds for a
--     Senior too. Every other role check in RLS names roles explicitly and never names 'senior',
--     so a Senior reads people and service_users rows exactly as a carer does: their own record
--     only. The names come from ONE function below, which returns names and nothing else.
--   * A Senior is not counted as a paid user, and is never offered as someone who conducts or
--     completes (the staff pickers on Forms), the same as a carer.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

-- The two role lists.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array[
  'platform_admin', 'company_admin', 'registered_individual', 'registered_manager', 'manager',
  'supervisor', 'recruiter', 'team_member', 'on_call', 'staff', 'senior'
]));
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check check (role = any (array[
  'company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor',
  'recruiter', 'team_member', 'on_call', 'staff', 'senior'
]));

-- A carer's own login, whichever of the two.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('staff', 'senior')
      and p.status = 'active'
  );
$$;

-- An Admin may invite a Senior (a branch lead still only gives carers their login, 0316).
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert
  with check (
    is_platform_admin()
    or (
      is_company_admin(company_id)
      and role = any (array['company_admin', 'registered_individual', 'registered_manager',
        'manager', 'supervisor', 'recruiter', 'on_call', 'team_member', 'staff', 'senior'])
    )
    or (role = 'staff' and branch_id is not null and is_branch_lead(branch_id))
  );

-- Not a paid user, and not offered in the staff pickers on Forms. Edited in place by text so the
-- rest of each function is exactly as it was; each guard fails loudly if the text has moved.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.company_active_user_count(uuid)'::regprocedure) into v_def;
  if position($q$'senior'$q$ in v_def) = 0 then
    v_new := replace(v_def, $q$and p.role <> 'staff'$q$, $q$and p.role not in ('staff', 'senior')$q$);
    if v_new = v_def then raise exception '0338: company_active_user_count text not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef('public.rebake_form_field_options(uuid)'::regprocedure) into v_def;
  if position($q$'senior'$q$ in v_def) = 0 then
    v_new := replace(v_def, $q$('platform_admin', 'staff', 'team_member')$q$, $q$('platform_admin', 'staff', 'senior', 'team_member')$q$);
    if v_new = v_def then raise exception '0338: rebake_form_field_options text not found'; end if;
    execute v_new;
  end if;
end $$;

-- ===========================================================================
-- THE NAMES. The only thing a Senior reads beyond their own record.
-- ===========================================================================
-- Names only, current records only (no leavers, no archived, no ended packages), from the
-- branches the Senior is assigned to, and only the lists their company has left ticked on the
-- Senior tile (company_role_modules holds what is switched OFF, absence means on). Anyone who is
-- not an active Senior gets nothing, so the function cannot be used to widen another role.
create or replace function public.senior_name_list(p_kind text)
returns table (full_name text, branch_name text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_module text;
begin
  select p.company_id into v_company
  from public.profiles p
  where p.id = auth.uid() and p.role = 'senior' and p.status = 'active';
  if v_company is null then return; end if;

  v_module := case p_kind when 'people' then 'people' when 'service_users' then 'service_users' end;
  if v_module is null then return; end if;
  if exists (
    select 1 from public.company_role_modules m
    where m.company_id = v_company and m.role = 'senior' and m.module_key = v_module
  ) then
    return;
  end if;

  if p_kind = 'people' then
    return query
      select pe.full_name, b.name
      from public.people pe
      join public.user_branches ub on ub.branch_id = pe.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = pe.branch_id
      where pe.company_id = v_company
        and pe.archived_at is null
        and coalesce(pe.employment_status, 'active') = 'active'
      order by pe.full_name;
  else
    return query
      select su.full_name, b.name
      from public.service_users su
      join public.user_branches ub on ub.branch_id = su.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = su.branch_id
      where su.company_id = v_company
        and su.archived_at is null
        and coalesce(su.service_status, 'active') = 'active'
        and (su.discharge_date is null or su.discharge_date >= current_date)
      order by su.full_name;
  end if;
end;
$$;

revoke all on function public.senior_name_list(text) from public, anon;
grant execute on function public.senior_name_list(text) to authenticated;
