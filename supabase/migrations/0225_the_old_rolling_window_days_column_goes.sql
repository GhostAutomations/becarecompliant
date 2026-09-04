-- 0225_the_old_rolling_window_days_column_goes
-- The follow-up 0223 promised, and the same step 0221 took for probation. The build
-- that reads rolling_window_value and rolling_window_unit is live in production
-- (commit b9ad0ae, state READY), person_absence_summary now builds its interval from
-- those two columns, and nothing in the codebase references rolling_window_days, so
-- the old column goes rather than sitting there as a second, silently stale answer.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_config
  drop column if exists rolling_window_days;
