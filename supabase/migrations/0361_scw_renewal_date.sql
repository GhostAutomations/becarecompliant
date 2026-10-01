-- 0361 SOCIAL CARE WALES RENEWAL DATE (Phil, 2026-10-01, popup).
--
-- Registration with Social Care Wales lasts three years from the date it was granted or renewed
-- (Registration Rules 2024, rule 25(2)); the renewal must reach Social Care Wales at least 21 days
-- before it expires (rule 16(4)), and if it does not, the worker comes off the register and cannot
-- work in a role that needs registration. The employer sees each worker's renewal date in its own
-- SCWonline account, so it is typed in here as a plain date beside the number (0060).
alter table public.people add column if not exists scw_renewal_date date;
comment on column public.people.scw_renewal_date is
  'Social Care Wales registration renewal date, as shown in SCWonline. Amber 90 days before, red once passed (lib/people/scw.ts).';
