-- 0219_probation_is_three_months_by_default
-- Probation shipped as 180 days (six months). The real period in domiciliary care
-- is two to three months, so the product default was wrong for every company.
-- 90 days is the DEADLINE, not the expected date: passing someone at two months is
-- completing the Probation Review early and the record keeps the actual date, so
-- nobody looks overdue for using the full period, and the probation extension is
-- there for the cases that need longer.
-- Same rule as 0216/0217/0218: the default the product creates changes, AND
-- existing companies move, scoped to those still on the untouched 180 so a company
-- that chose its own period keeps it.
-- No existing carer is touched: probation_end_due is stamped on the record when the
-- person is added, and changing the company period has never recomputed it.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  alter column probation_period_days set default 90;

update public.companies
   set probation_period_days = 90
 where probation_period_days = 180;
