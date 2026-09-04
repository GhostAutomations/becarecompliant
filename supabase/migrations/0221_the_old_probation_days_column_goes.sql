-- 0221_the_old_probation_days_column_goes
-- The follow-up 0220 promised. The build that reads probation_period_value and
-- probation_period_unit is live in production (deployment for commit d3e8313,
-- state READY), and no code, view or function references probation_period_days any
-- more, so the old column is dropped rather than left to rot as a second, silently
-- stale answer to the same question.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  drop column if exists probation_period_days;
