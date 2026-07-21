-- 0097_invoice_schedule_day
-- Recurring schedules can target a specific day: weekly picks a day of week
-- (0 = Monday .. 6 = Sunday), monthly picks a day of month (1..28, so it always
-- exists in every month). Both nullable; when null the run keeps the issue day.
alter table public.invoice_schedules
  add column if not exists day_of_week smallint,
  add column if not exists day_of_month smallint;

alter table public.invoice_schedules
  drop constraint if exists invoice_schedules_day_of_week_chk;
alter table public.invoice_schedules
  add constraint invoice_schedules_day_of_week_chk
  check (day_of_week is null or (day_of_week between 0 and 6));

alter table public.invoice_schedules
  drop constraint if exists invoice_schedules_day_of_month_chk;
alter table public.invoice_schedules
  add constraint invoice_schedules_day_of_month_chk
  check (day_of_month is null or (day_of_month between 1 and 28));
