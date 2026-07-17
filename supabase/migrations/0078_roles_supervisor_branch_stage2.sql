-- 0078_roles_supervisor_branch_stage2
-- Roles overhaul, Stage 2. A Supervisor now sees and can complete/edit everything in
-- THEIR BRANCH, not just an assigned caseload. Done by redefining the two supervisor
-- helpers to be branch-based (the caller is an active supervisor assigned, via
-- user_branches, to the record's branch). Because people_select / service_users_select /
-- check_instances_select / evidence_select / can_complete_* all already call these
-- helpers, the change flows through with no policy rewrites. Managers, Viewers and Admins
-- are untouched (the helpers still key on role = 'supervisor'). person_assignments is left
-- in place but no longer restricts a supervisor's visibility.
-- Supervisors are still NOT in is_branch_manager, so they remain blocked from Complaints
-- and from approving holidays (Stage 3). Applied to ref bgrtcvyjuwopunpnudeu only.

create or replace function public.is_person_supervisor(p_person_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1
    from public.people pe
    join public.user_branches ub on ub.branch_id = pe.branch_id and ub.user_id = auth.uid()
    join public.profiles pr on pr.id = auth.uid()
    where pe.id = p_person_id
      and pr.role = 'supervisor'
      and pr.status = 'active'
  );
$$;

create or replace function public.is_service_user_supervisor(p_service_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1
    from public.service_users su
    join public.user_branches ub on ub.branch_id = su.branch_id and ub.user_id = auth.uid()
    join public.profiles pr on pr.id = auth.uid()
    where su.id = p_service_user_id
      and pr.role = 'supervisor'
      and pr.status = 'active'
  );
$$;
