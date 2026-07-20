-- 0091_invoicing_fixed_rates
-- A second rate per service: a FIXED rate (a flat fee for the whole visit or
-- session, not per hour), alongside the hourly rate. Shown as a third column in
-- Settings -> Invoicing -> Rates. becarecompliant project ONLY.

alter table public.invoicing_config
  add column if not exists rate_care_fixed_pence integer not null default 0 check (rate_care_fixed_pence >= 0),
  add column if not exists rate_sit_fixed_pence integer not null default 0 check (rate_sit_fixed_pence >= 0),
  add column if not exists rate_overnight_fixed_pence integer not null default 0 check (rate_overnight_fixed_pence >= 0),
  add column if not exists rate_sleep_fixed_pence integer not null default 0 check (rate_sleep_fixed_pence >= 0),
  add column if not exists rate_shopping_fixed_pence integer not null default 0 check (rate_shopping_fixed_pence >= 0),
  add column if not exists rate_cleaning_fixed_pence integer not null default 0 check (rate_cleaning_fixed_pence >= 0);
