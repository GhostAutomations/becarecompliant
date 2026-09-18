-- 0294_a_supervisor_records_training_in_her_branches
--
-- Phil, 2026-09-17: "we have given supervisors access to training but they cant change anything
-- or enter any training?"
--
-- 0289 let a Supervisor SEE training, on the rule that seeing a carer means seeing their training.
-- Nobody widened the write, so she got a register she could read and not touch: the very shape
-- manage-scope.ts exists to prevent, a screen offering what the database will refuse, arrived at
-- from the other side.
--
-- Scoped exactly as a Branch Manager is, through user_branches, using the helper 0290 added.
-- is_company_wide and platform_admin are ORed in separately as they already were.
--
-- What this does NOT widen: the course catalogue stays Admins only (training_courses_write),
-- because what a company measures its staff against is not a branch decision.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists person_training_write on public.person_training;
create policy person_training_write on public.person_training
  for all
  using (
    is_platform_admin()
    or is_company_wide(company_id)
    or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  )
  with check (
    is_platform_admin()
    or is_company_wide(company_id)
    or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  );
