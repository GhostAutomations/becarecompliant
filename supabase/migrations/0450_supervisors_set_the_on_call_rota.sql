-- 0450: Supervisors set the On Call rota (Phil, 2026-10-13, docs/decisions/on-call.md).
--
-- WHAT PHIL DECIDED (popups):
--   * A company wide rota (branch_id null) can now be set by Managers and Supervisors in the
--     company, not only by Admins, the Registered roles and On Call. On a branch rota a Supervisor
--     still sets only her own branch(es), as before.
--   * Recruiters (Supervisors for the whole company, 0310) get the same: every branch's rota, the
--     company wide rota, and the company wide Handover, which they could not read before.
--   * The Handover stays exactly as it is for everybody else.
--   * A per company switch, per role, on the Supervisor and Recruiter tiles in Settings, Role
--     access: "On Call: can set the rota". The database reads it, so unticking it takes rota
--     editing away from that role (branch and company wide) while they keep reading the rota and
--     the Handover. On by default, so Supervisors keep the branch rota access they have today.
--   * Every change to a rota shift is audit logged with who, when, and the row before and after
--     (audit F171), by a trigger, so no writer can skip it.
--
-- WHAT DOES NOT CHANGE: Admins, Registered Managers, Registered Individuals and On Call keep
-- every rota and Handover right they had; Managers keep theirs and gain the company wide rota;
-- Seniors, Viewers and carers still have nothing here. Proved before and after with
-- scripts/on-call-rota-probe.sql.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------
-- 1. The switch.
-- ---------------------------------------------------------------------------------------------
alter table public.companies
  add column if not exists on_call_rota_roles text[] not null default array['supervisor', 'recruiter']::text[];

do $$ begin
  alter table public.companies add constraint companies_on_call_rota_roles_allowed
    check (on_call_rota_roles <@ array['supervisor', 'recruiter']::text[]);
exception when duplicate_object then null; end $$;

comment on column public.companies.on_call_rota_roles is
  'Which of Supervisor and Recruiter may set the On Call rota (Settings, Role access). Managers and above always may.';

-- Set from the Supervisor or Recruiter tile in Settings, Role access. Admin (or the Founder) only.
create or replace function public.set_on_call_rota_role_for(p_company_id uuid, p_role text, p_on boolean)
returns text[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare result text[];
begin
  if p_company_id is null or not (public.is_company_admin(p_company_id) or public.is_platform_admin()) then
    raise exception 'Only a Company Admin can change who sets the On Call rota';
  end if;
  if p_role not in ('supervisor', 'recruiter') then
    raise exception 'That role cannot be given the On Call rota';
  end if;
  update public.companies
     set on_call_rota_roles = case when p_on
           then (select array_agg(distinct r) from unnest(on_call_rota_roles || p_role) r)
           else array_remove(on_call_rota_roles, p_role) end
   where id = p_company_id returning on_call_rota_roles into result;
  return result;
end $function$;
revoke all on function public.set_on_call_rota_role_for(uuid, text, boolean) from public, anon;
grant execute on function public.set_on_call_rota_role_for(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Helpers.
-- ---------------------------------------------------------------------------------------------
-- A Manager, Supervisor or Recruiter of this company: who reads the company wide rota and uses
-- the company wide Handover. is_company_planner (Manager, Supervisor) is left alone: the Planner
-- uses it too, and the Planner is not part of this change.
create or replace function public.is_company_on_call_lead(cid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.status = 'active'
      and p.role in ('manager', 'supervisor', 'recruiter')
  );
$function$;

-- Whether the signed in Supervisor or Recruiter is ticked to set this company's rota.
create or replace function public.may_set_on_call_rota(cid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.profiles p
    join public.companies c on c.id = p.company_id
    where p.id = auth.uid()
      and p.company_id = cid
      and p.status = 'active'
      and p.role = any (c.on_call_rota_roles)
  );
$function$;

-- Who may add, change or remove a rota shift. On a branch: the branch's Manager (and every
-- company wide role, through is_branch_manager), or its Supervisor (a Recruiter for any branch)
-- when ticked. On the company wide rota: a Manager, or a ticked Supervisor or Recruiter.
-- Admins, the Registered roles, On Call and the Founder: always.
create or replace function public.can_set_on_call_shift(cid uuid, bid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.is_platform_admin()
      or public.is_company_wide(cid)
      or public.is_company_on_call(cid)
      or (bid is not null and (
            public.is_branch_manager(bid)
            or (public.is_branch_supervisor(bid) and public.may_set_on_call_rota(cid))
          ))
      or (bid is null and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.company_id = cid and p.status = 'active' and p.role = 'manager'
          ))
      or (bid is null and public.may_set_on_call_rota(cid));
$function$;

revoke execute on function public.is_company_on_call_lead(uuid) from public, anon;
revoke execute on function public.may_set_on_call_rota(uuid) from public, anon;
revoke execute on function public.can_set_on_call_shift(uuid, uuid) from public, anon;
grant execute on function public.is_company_on_call_lead(uuid) to authenticated;
grant execute on function public.may_set_on_call_rota(uuid) to authenticated;
grant execute on function public.can_set_on_call_shift(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. The rota's policies. Reading: as before, plus a Recruiter on the company wide rota.
-- ---------------------------------------------------------------------------------------------
drop policy if exists on_call_shifts_select on public.on_call_shifts;
create policy on_call_shifts_select on public.on_call_shifts for select to authenticated using (
  is_platform_admin() or is_company_wide(company_id) or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and (is_company_planner(company_id) or is_company_on_call_lead(company_id)))
);

drop policy if exists on_call_shifts_insert on public.on_call_shifts;
create policy on_call_shifts_insert on public.on_call_shifts for insert to authenticated
  with check (can_set_on_call_shift(company_id, branch_id));

drop policy if exists on_call_shifts_update on public.on_call_shifts;
create policy on_call_shifts_update on public.on_call_shifts for update to authenticated
  using (can_set_on_call_shift(company_id, branch_id))
  with check (can_set_on_call_shift(company_id, branch_id));

drop policy if exists on_call_shifts_delete on public.on_call_shifts;
create policy on_call_shifts_delete on public.on_call_shifts for delete to authenticated
  using (can_set_on_call_shift(company_id, branch_id));

-- ---------------------------------------------------------------------------------------------
-- 4. The Handover: unchanged, except that a Recruiter now reads, adds and edits company wide
--    entries as a Supervisor does. Deleting stays exactly as it was.
-- ---------------------------------------------------------------------------------------------
drop policy if exists on_call_logs_select on public.on_call_logs;
create policy on_call_logs_select on public.on_call_logs for select to authenticated using (
  is_platform_admin() or is_company_wide(company_id) or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and (is_company_planner(company_id) or is_company_on_call_lead(company_id)))
);

drop policy if exists on_call_logs_insert on public.on_call_logs;
create policy on_call_logs_insert on public.on_call_logs for insert to authenticated with check (
  is_platform_admin() or is_company_wide(company_id) or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and (is_company_planner(company_id) or is_company_on_call_lead(company_id)))
);

drop policy if exists on_call_logs_update on public.on_call_logs;
create policy on_call_logs_update on public.on_call_logs for update to authenticated using (
  is_platform_admin() or is_company_wide(company_id) or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and (is_company_planner(company_id) or is_company_on_call_lead(company_id)))
) with check (
  is_platform_admin() or is_company_wide(company_id) or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and (is_company_planner(company_id) or is_company_on_call_lead(company_id)))
);

-- ---------------------------------------------------------------------------------------------
-- 5. Every rota change in the audit log (F171): who, when, what, and the row before and after.
-- ---------------------------------------------------------------------------------------------
create or replace function public.audit_on_call_shift()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r public.on_call_shifts;
  v_actor uuid := auth.uid();
  v_email text;
  v_role text;
  v_where text;
  v_cell text;
  v_before text;
  v_after text;
  v_action text;
  v_summary text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' - 'updated_by' end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' - 'updated_by' end;
  -- A save that changed nothing is not a change.
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  if v_actor is not null then
    select p.email, p.role into v_email, v_role from public.profiles p where p.id = v_actor;
  end if;

  select coalesce((select b.name from public.branches b where b.id = r.branch_id), 'whole company')
    into v_where;
  v_cell := upper(coalesce(r.slot, '')) || ' '
         || to_char(coalesce(r.shift_date, (r.starts_at at time zone 'UTC')::date), 'DD/MM/YYYY')
         || ', ' || v_where;

  if tg_op <> 'INSERT' then
    v_before := coalesce((select p.full_name from public.profiles p where p.id = old.on_call_profile_id), old.on_call_name, 'no one');
  end if;
  if tg_op <> 'DELETE' then
    v_after := coalesce((select p.full_name from public.profiles p where p.id = new.on_call_profile_id), new.on_call_name, 'no one');
  end if;

  if tg_op = 'INSERT' then
    v_action := 'on_call.shift_created';
    v_summary := 'Rota: ' || v_after || ' on call, ' || v_cell;
  elsif tg_op = 'UPDATE' then
    v_action := 'on_call.shift_changed';
    v_summary := 'Rota: ' || v_cell || ' changed'
              || case when v_before is distinct from v_after then ' from ' || v_before || ' to ' || v_after else '' end;
  else
    v_action := 'on_call.shift_removed';
    v_summary := 'Rota: ' || v_before || ' removed from ' || v_cell;
  end if;

  insert into public.audit_log (company_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata)
  values (
    r.company_id, v_actor, v_email, coalesce(v_role, case when v_actor is null then 'system' end),
    v_action, 'on_call_shift', r.id::text, v_summary,
    jsonb_build_object('branch_id', r.branch_id, 'shift_date', r.shift_date, 'slot', r.slot,
                       'before', v_old, 'after', v_new)
  );
  return null;
end;
$function$;

revoke execute on function public.audit_on_call_shift() from public, anon, authenticated;

drop trigger if exists audit_on_call_shift on public.on_call_shifts;
create trigger audit_on_call_shift
  after insert or update or delete on public.on_call_shifts
  for each row execute function public.audit_on_call_shift();
