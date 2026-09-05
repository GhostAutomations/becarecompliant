-- 0230_the_second_review_cadence_goes
-- The follow-up promised when Complex and Simple became two views of one review. The
-- build that reads the Care Plan Review's own interval for both views is live in
-- production (commit 735f216, state READY) and nothing in the codebase references
-- complex_review_interval_days, so the column goes.
--
-- It was never a second SCHEDULE, only a second NUMBER for one: the register and record
-- pages read this column while the exported report already read the check definition,
-- so a Complex branch's report and its register could compute different review dates.
-- Deleting the column is what makes that impossible rather than merely unlikely.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  drop column if exists complex_review_interval_days;
