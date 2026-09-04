-- 0220_probation_in_the_words_of_the_contract
-- Probation was a number of days. An employment contract says "12 weeks" or "three
-- months", and a month is not thirty days: three months from 30 November is 28
-- February, which no day count expresses. The period is now a NUMBER and a UNIT, so
-- a company enters what its contract says and the existing recurrence engine (the
-- same one every check uses, month-end clamping included) works out the date.
--
-- Backfill: the seeded 90 days becomes 3 months, which is what it was standing in
-- for. Any other value is preserved exactly, as days, because it was chosen.
--
-- probation_period_days is deliberately LEFT IN PLACE by this migration. The new
-- code reads the new columns; dropping the old one in the same breath would break
-- the build that is still live while the new one deploys. It is dropped in a
-- follow-up migration once the new build is serving.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  add column if not exists probation_period_value integer not null default 3,
  add column if not exists probation_period_unit text not null default 'month';

alter table public.companies
  drop constraint if exists companies_probation_period_unit_check;
alter table public.companies
  add constraint companies_probation_period_unit_check
  check (probation_period_unit in ('day', 'week', 'month'));

alter table public.companies
  drop constraint if exists companies_probation_period_value_check;
alter table public.companies
  add constraint companies_probation_period_value_check
  check (probation_period_value between 1 and 730);

update public.companies
   set probation_period_value = case when probation_period_days = 90 then 3 else probation_period_days end,
       probation_period_unit  = case when probation_period_days = 90 then 'month' else 'day' end;
