-- A TRAINING COURSE CAN BELONG TO CERTAIN JOB TITLES.
--
-- Phil, 2026-09-16: "on supervisors and above complete Assessing Needs - 3 years, Care
-- Planning - 3 years, Risk Assessment - 3 years, Supervision and Appraisal - 3 years."
--
-- Four courses that only the people who supervise ever do. Until now every course applied to
-- everybody, so those four sat red on all thirteen Cardiff carers and told nobody anything:
-- sixty five red cells on the matrix for training twelve of them are not meant to hold. Red
-- that means nothing is worse than no column, because it trains people to ignore red.
--
-- The same shape as check_definitions.job_titles (0253), deliberately: NULL or empty means
-- everybody, which is what every existing course is and stays. Matched trimmed and case
-- insensitively, because a job title is typed by a person.
--
-- WHICH TITLES (Phil, 2026-09-16): Supervisor and above ONLY. Not Senior Care Assistant,
-- which differs from the Lead the Leader check on purpose and is his call, and including the
-- Responsible Individual.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.training_courses
  add column if not exists job_titles text[];

comment on column public.training_courses.job_titles is
  'Job titles this course belongs to. NULL or empty means everybody. Matched trimmed and case insensitively.';

update public.training_courses
   set job_titles = array['Supervisor', 'Senior Supervisor', 'Deputy Manager', 'Registered Manager', 'Responsible Individual'],
       updated_at = now()
 where name in ('Assessing Needs', 'Care Planning', 'Risk Assessment', 'Supervision and Appraisal')
   and job_titles is null;
