-- 0173_team_member_sees_own_training
--
-- THE LIST item 26 leftover: a Team Member cannot see their own training.
--
-- Everything on /my is read through the caller's own RLS, which is the right design, but the
-- training policies only ever admitted company-wide roles and branch managers. So a carer
-- could see their holidays, their submissions and their briefings, and had no way to find out
-- which of their own certificates expires next month. The person being chased about training
-- was the only person who could not look it up.
--
-- Two narrow policies, both ADDITIVE (Postgres ORs multiple permissive policies together, so
-- nothing already permitted changes):
--
--   1. person_training: a person may read the rows that are THEIRS, matched through
--      people.profile_id. Read only. Recording training stays a manager's job.
--   2. training_courses: any member of the company may read the course list, because a
--      training record without the course name is unreadable. Course names and renewal
--      periods are the company's own syllabus, not personal data about anybody.

create policy person_training_select_own on public.person_training
  for select
  using (
    exists (
      select 1 from public.people p
      where p.id = person_training.person_id
        and p.profile_id = auth.uid()
    )
  );

create policy training_courses_select_member on public.training_courses
  for select
  using (public.is_company_member(company_id));
