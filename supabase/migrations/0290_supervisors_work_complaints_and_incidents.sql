-- 0290_supervisors_work_complaints_and_incidents
--
-- Phil, 2026-09-17: "supervisors need access to complaints and incidents", and asked how far:
-- log and work them, like a Branch Manager, in their own branches.
--
-- WHY THAT AND NOT READ ONLY. A supervisor is usually the one who took the call or attended the
-- visit. Making her find a manager before anything can be written down is how an incident gets
-- written up a day late, second hand, or not at all, and the date it was raised is the one fact
-- a complaint cannot afford to be vague about.
--
-- SCOPED, exactly as a Branch Manager is: her own branches, through user_branches, and nothing
-- else. A new helper says so rather than each policy growing its own copy of the rule.
--
-- is_branch_manager is deliberately NOT widened. It is named after the role it describes and is
-- used by People, Service Users, checks, training and invoicing; quietly making it mean "or a
-- supervisor" would hand supervisors all of those in one line, which is not what was asked for.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- 1. The rule, once.
create or replace function public.is_branch_supervisor(bid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1 from public.profiles p
    join public.user_branches ub on ub.user_id = p.id
    where p.id = auth.uid()
      and p.role = 'supervisor'
      and p.status = 'active'
      and ub.branch_id = bid
  );
$fn$;

comment on function public.is_branch_supervisor(uuid) is
  'An active Supervisor assigned to this branch. Company wide roles are NOT folded in: every policy using this already ORs them in separately, and a helper that quietly returns true for an Admin cannot be read as the sentence it is named after.';

revoke all on function public.is_branch_supervisor(uuid) from public;
revoke all on function public.is_branch_supervisor(uuid) from anon;
grant execute on function public.is_branch_supervisor(uuid) to authenticated;
grant execute on function public.is_branch_supervisor(uuid) to service_role;

-- 2. Complaints. SELECT, INSERT, UPDATE and the two child tables.
--
-- Every UPDATE is written with an explicit WITH CHECK. Postgres falls back to USING when it is
-- omitted, which happens to be right here, but leaving it implicit on a policy somebody will one
-- day widen is how a row becomes readable and editable INTO a branch the caller does not run.
drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints
  for select using (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
    or is_company_on_call(company_id)
  );

drop policy if exists complaints_insert on public.complaints;
create policy complaints_insert on public.complaints
  for insert with check (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
    or is_company_on_call(company_id)
  );

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints
  for update using (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
    or is_company_on_call(company_id)
  ) with check (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
    or is_company_on_call(company_id)
  );

drop policy if exists complaint_responses_select on public.complaint_responses;
create policy complaint_responses_select on public.complaint_responses
  for select using (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
    or is_company_on_call(company_id)
  );

drop policy if exists complaint_responses_insert on public.complaint_responses;
create policy complaint_responses_insert on public.complaint_responses
  for insert with check (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
    or is_company_on_call(company_id)
  );

-- complaint_people is reached through its complaint, so it asks the complaint's branch.
drop policy if exists complaint_people_select on public.complaint_people;
create policy complaint_people_select on public.complaint_people
  for select using (
    is_platform_admin() or is_company_admin(company_id) or is_company_on_call(company_id)
    or exists (
      select 1 from public.complaints c
      where c.id = complaint_people.complaint_id
        and (is_branch_manager(c.branch_id) or is_branch_supervisor(c.branch_id))
    )
  );

drop policy if exists complaint_people_insert on public.complaint_people;
create policy complaint_people_insert on public.complaint_people
  for insert with check (
    is_platform_admin() or is_company_admin(company_id) or is_company_on_call(company_id)
    or exists (
      select 1 from public.complaints c
      where c.id = complaint_people.complaint_id
        and (is_branch_manager(c.branch_id) or is_branch_supervisor(c.branch_id))
    )
  );

drop policy if exists complaint_people_delete on public.complaint_people;
create policy complaint_people_delete on public.complaint_people
  for delete using (
    is_platform_admin() or is_company_admin(company_id) or is_company_on_call(company_id)
    or exists (
      select 1 from public.complaints c
      where c.id = complaint_people.complaint_id
        and (is_branch_manager(c.branch_id) or is_branch_supervisor(c.branch_id))
    )
  );

-- 3. Incidents. No On Call here either: an out of hours caller records the call in the Handover,
-- and an incident is written up by the branch with the notifiable and safeguarding decisions on it.
drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents
  for select using (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
  );

drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on public.incidents
  for insert with check (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
  );

drop policy if exists incidents_update on public.incidents;
create policy incidents_update on public.incidents
  for update using (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
  ) with check (
    is_platform_admin() or is_company_admin(company_id)
    or is_branch_manager(branch_id) or is_branch_supervisor(branch_id)
  );
