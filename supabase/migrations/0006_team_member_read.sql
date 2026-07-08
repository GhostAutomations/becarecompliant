-- 0006_team_member_read
-- Phase 3 change (Phil, 2026-07-08): Team Members get READ ONLY access to the
-- People register for the branch(es) an Admin assigns them (via user_branches).
-- No write anywhere (they cannot add/edit/transfer/archive or complete checks).
-- This supersedes the earlier "Team Member = own record only" rule. Supervisors
-- are unchanged (caseload only): a dedicated role-scoped helper avoids widening
-- Supervisors when we grant Team Members branch read. Completed-form Evidence
-- content stays restricted (Managers/Supervisors/Admins/author) — Team Members
-- see the at-a-glance register and due dates, not the sensitive form contents.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- role = team_member AND assigned to this branch by an Admin.
create or replace function public.is_branch_team_member(bid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    join public.user_branches ub on ub.user_id = p.id
    where p.id = auth.uid()
      and p.role = 'team_member'
      and p.status = 'active'
      and ub.branch_id = bid
  );
$$;

-- people: add team-member branch read (read only; write policies are unchanged).
drop policy if exists people_select on public.people;
create policy people_select on public.people
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_team_member(branch_id)
    or public.is_person_supervisor(id)
    or profile_id = auth.uid()
  );

-- check_instances: add team-member branch read (so the register matrix + RAG show).
drop policy if exists check_instances_select on public.check_instances;
create policy check_instances_select on public.check_instances
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (branch_id is not null and public.is_branch_team_member(branch_id))
    or (person_id is not null and public.is_person_supervisor(person_id))
    or exists (
      select 1 from public.people pe
      where pe.id = check_instances.person_id and pe.profile_id = auth.uid()
    )
  );
