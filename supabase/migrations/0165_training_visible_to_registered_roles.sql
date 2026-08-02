-- 0165_training_visible_to_registered_roles
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- THE SAME OVERSIGHT AS 0150, for the third time. The app offers a Registered Individual and a
-- Registered Manager the Training page: they are in the nav entry, in the page's ALLOWED list,
-- and in saveTraining's role check. RLS then hands them nothing, because
-- training_courses_select names is_company_admin and is_company_manager and neither covers a
-- Registered role. No courses means no columns, so the matrix is empty, the Training page is
-- blank, and the dashboard's training percentage is built from nothing.
--
-- THE HELPER THAT ALREADY EXISTS is is_company_wide(cid): company_admin, registered_individual
-- and registered_manager. It is what is_branch_manager reaches for internally, which is why
-- person_training happens to work for a Registered Manager today and training_courses does not.
--
-- THREE POLICIES, one class of fault.
--
--   1. training_courses_select      the live break. Registered roles see no courses at all.
--   2. person_training select/write NOT broken today because every row has a branch and
--                                   is_branch_manager falls through to is_company_wide. It is
--                                   the same bug waiting: a person with no branch is invisible
--                                   to a company wide role, and nothing stops a person having
--                                   no branch. Named explicitly rather than left to a helper's
--                                   internals.
--   3. check_definitions_update     found while in here, not on the list. Identical shape:
--                                   admin or manager, so a Registered Manager cannot edit a
--                                   check definition the app lets them open.
--
-- WHAT THIS DOES NOT CHANGE. training_courses_write stays Admins only, matching saveCourse's own
-- guard ("Only Admins can change training courses"). Whether a Registered Manager should be able
-- to add a course to the catalogue is a permissions DECISION, not a bug, and it is Phil's.
--
-- DROP THEN CREATE, because create policy has no if not exists and this file must be replayable
-- onto a fresh project.

-- 1. The course catalogue: readable by every role that is company wide, plus branch managers.
drop policy if exists training_courses_select on public.training_courses;
create policy training_courses_select on public.training_courses
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_manager(company_id)
  );

-- 2. The per person records. The branch clause stays: a branch Manager is still limited to their
--    own branches. The company wide clause is what a Registered role and an Admin travel on, and
--    it no longer depends on the row having a branch.
drop policy if exists person_training_select on public.person_training;
create policy person_training_select on public.person_training
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  );

drop policy if exists person_training_write on public.person_training;
create policy person_training_write on public.person_training
  for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  )
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  );

-- 3. Check definitions: the same fault found in passing. Insert and delete stay Admin only,
--    which is deliberate; it is only the UPDATE that a Registered Manager was refused.
drop policy if exists check_definitions_update on public.check_definitions;
create policy check_definitions_update on public.check_definitions
  for update to authenticated
  using (
    public.is_company_wide(company_id)
    or public.is_company_manager(company_id)
    or public.is_platform_admin()
  )
  with check (
    public.is_company_wide(company_id)
    or public.is_company_manager(company_id)
    or public.is_platform_admin()
  );
