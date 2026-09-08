-- 0236_due_soon_is_a_fortnight_not_a_month
-- Phil, 2026-09-08: "once you complete the form as yes, the spot check is amber straight
-- away because it is due soon... the next one, eighth of October, so it would never be
-- green. So let's have that fourteen days amber as well."
--
-- The due soon window was thirty days. A Spot Check runs every thirty days, so it went
-- amber the instant it was completed and stayed amber until the day it went red: green
-- was unreachable, and a colour that never changes tells nobody anything. Fourteen days
-- gives a fortnight of green and a fortnight of warning on a monthly cadence.
--
-- ALL COMPANIES, CURRENT AND FUTURE (the standing rule):
--   * the column default moves, so every company created from here on gets fourteen;
--   * companies still sitting on the untouched thirty are moved with it;
--   * a company that has DELIBERATELY set its own window is left exactly as it is, and
--     so is any single check with its own amber_days override.
--
-- The registers and the matrix read this through the effective_amber views
-- (coalesce(cd.amber_days, co.amber_days_default)), so they follow without changing.
-- The app's own fallback moved in the same commit: lib/recurrence.ts DEFAULT_AMBER_DAYS,
-- one constant replacing seven separate copies of the number 30.
--
-- NOT touched: training courses have their own amber_days, defaulting to 30. A training
-- certificate is booked and sat weeks ahead, so a fortnight's notice is not the same
-- question, and nobody has asked for it to change.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  alter column amber_days_default set default 14;

update public.companies
   set amber_days_default = 14
 where amber_days_default = 30;
