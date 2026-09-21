-- 0309_a_supervisor_runs_their_own_branch
--
-- Phil, 2026-09-21: "supervisor and above need to be able to add people, service users and update
-- training", and, asked what a supervisor should reach: every person and service user in the
-- branches they are assigned to, managed exactly as a Manager manages them.
--
-- Training was already theirs (0294). People and Service Users were not: both registers were
-- is_branch_manager for select, insert and update, and a Supervisor saw only the records assigned
-- to her. She could not add a carer, and had she been allowed to, the record would have vanished
-- from her own register the moment she saved it.
--
-- is_branch_lead(bid) is the new name for "runs this branch": a Manager or a Supervisor assigned
-- to it, and (through is_branch_manager) the company wide roles and the platform admin. Every
-- policy below now asks that one question, so widening or narrowing who runs a branch is one
-- edit rather than fourteen.
--
-- DELIBERATELY NOT WIDENED: invoicing and invoice schedules (money), absence, holidays, invites
-- and the public enquiry inbox. Those stay with Managers and above until Phil says otherwise.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.is_branch_lead(bid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.is_branch_manager(bid) or public.is_branch_supervisor(bid);
$$;

grant execute on function public.is_branch_lead(uuid) to authenticated;

-- ===========================================================================
-- The two registers.
-- ===========================================================================
drop policy if exists people_select on public.people;
create policy people_select on public.people for select using (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
  or is_branch_team_member(branch_id) or is_person_supervisor(id)
  or is_company_on_call(company_id) or (profile_id = auth.uid())
);
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert with check (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
);
drop policy if exists people_update on public.people;
create policy people_update on public.people for update using (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
) with check (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
);

drop policy if exists service_users_select on public.service_users;
create policy service_users_select on public.service_users for select using (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
  or is_service_user_supervisor(id)
);
drop policy if exists service_users_insert on public.service_users;
create policy service_users_insert on public.service_users for insert with check (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
);
drop policy if exists service_users_update on public.service_users;
create policy service_users_update on public.service_users for update using (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
) with check (
  is_platform_admin() or is_company_admin(company_id) or is_branch_lead(branch_id)
);

-- ===========================================================================
-- What hangs off a record: the checks, the trackers, the training register, the care plan,
-- the outcomes, the assignments and the history. A register you can open and nothing under it
-- is not the register.
-- ===========================================================================
drop policy if exists check_instances_select on public.check_instances;
create policy check_instances_select on public.check_instances for select using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or (person_id is not null and is_person_supervisor(person_id))
  or (person_id is not null and exists (select 1 from public.people pe where pe.id = check_instances.person_id and pe.profile_id = auth.uid()))
  or (service_user_id is not null and is_service_user_supervisor(service_user_id))
);

drop policy if exists person_trackers_select on public.person_trackers;
create policy person_trackers_select on public.person_trackers for select using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or (branch_id is not null and is_branch_team_member(branch_id))
  or is_person_supervisor(person_id)
  or exists (select 1 from public.people pe where pe.id = person_trackers.person_id and pe.profile_id = auth.uid())
);

drop policy if exists service_user_trackers_select on public.service_user_trackers;
create policy service_user_trackers_select on public.service_user_trackers for select using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or is_service_user_supervisor(service_user_id)
);

drop policy if exists person_training_select on public.person_training;
create policy person_training_select on public.person_training for select using (
  is_platform_admin() or is_company_wide(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
);

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select using (
  is_platform_admin() or is_company_wide(company_id)
  or exists (select 1 from public.people pe where pe.id = assignments.person_id and (is_branch_lead(pe.branch_id) or pe.profile_id = auth.uid()))
);
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments for insert with check (
  is_platform_admin() or is_company_wide(company_id)
  or exists (select 1 from public.people pe where pe.id = assignments.person_id and is_branch_lead(pe.branch_id))
);
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments for update using (
  is_platform_admin() or is_company_wide(company_id)
  or exists (select 1 from public.people pe where pe.id = assignments.person_id and is_branch_lead(pe.branch_id))
) with check (
  is_platform_admin() or is_company_wide(company_id)
  or exists (select 1 from public.people pe where pe.id = assignments.person_id and is_branch_lead(pe.branch_id))
);

drop policy if exists care_plan_entries_select on public.care_plan_entries;
create policy care_plan_entries_select on public.care_plan_entries for select using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = care_plan_entries.service_user_id))
);
drop policy if exists care_plan_entries_write on public.care_plan_entries;
create policy care_plan_entries_write on public.care_plan_entries for all using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = care_plan_entries.service_user_id))
) with check (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = care_plan_entries.service_user_id))
);

drop policy if exists outcomes_reviews_select on public.outcomes_reviews;
create policy outcomes_reviews_select on public.outcomes_reviews for select using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = outcomes_reviews.service_user_id))
);
drop policy if exists outcomes_reviews_write on public.outcomes_reviews;
create policy outcomes_reviews_write on public.outcomes_reviews for all using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = outcomes_reviews.service_user_id))
) with check (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = outcomes_reviews.service_user_id))
);

drop policy if exists service_user_outcomes_select on public.service_user_outcomes;
create policy service_user_outcomes_select on public.service_user_outcomes for select using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = service_user_outcomes.service_user_id))
);
drop policy if exists service_user_outcomes_write on public.service_user_outcomes;
create policy service_user_outcomes_write on public.service_user_outcomes for all using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = service_user_outcomes.service_user_id))
) with check (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = service_user_outcomes.service_user_id))
);

drop policy if exists su_outcome_updates_select on public.service_user_outcome_updates;
create policy su_outcome_updates_select on public.service_user_outcome_updates for select using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = service_user_outcome_updates.service_user_id))
);
drop policy if exists su_outcome_updates_write on public.service_user_outcome_updates;
create policy su_outcome_updates_write on public.service_user_outcome_updates for all using (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = service_user_outcome_updates.service_user_id))
) with check (
  is_platform_admin() or is_company_admin(company_id)
  or is_branch_lead((select s.branch_id from public.service_users s where s.id = service_user_outcome_updates.service_user_id))
);

drop policy if exists migrated_completions_select on public.migrated_completions;
create policy migrated_completions_select on public.migrated_completions for select using (
  is_company_member(company_id) and (
    is_company_admin(company_id)
    or (record_type = 'person' and branch_id is not null and is_branch_member(branch_id))
    or (record_type = 'service_user' and branch_id is not null and is_branch_lead(branch_id))
  )
);

drop policy if exists evidence_files_select on public.evidence_files;
create policy evidence_files_select on public.evidence_files for select using (
  exists (
    select 1 from public.evidence e
    where e.id = evidence_files.evidence_id
      and (
        is_platform_admin() or is_company_admin(e.company_id)
        or (e.branch_id is not null and is_branch_lead(e.branch_id))
        or e.author_id = auth.uid()
        or (e.record_type = 'person' and e.record_id is not null and (
              is_person_supervisor(e.record_id)
              or exists (select 1 from public.people pe where pe.id = e.record_id and pe.profile_id = auth.uid())))
        or (e.record_type = 'service_user' and e.record_id is not null and is_service_user_supervisor(e.record_id))
      )
  )
);

drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence for select using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or author_id = auth.uid()
  or (record_type = 'complaint' and is_company_on_call(company_id))
  or (record_type = 'person' and record_id is not null and (
        is_person_supervisor(record_id)
        or ((not is_staff()) and exists (select 1 from public.people pe where pe.id = evidence.record_id and pe.profile_id = auth.uid()))))
  or (record_type = 'service_user' and record_id is not null and is_service_user_supervisor(record_id))
);
