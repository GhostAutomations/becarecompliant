-- 0090_invoicing_rates_logo
-- Invoicing additions (Phil, 2026-07-20):
--  1. Company logo for branded invoices (stored in the private evidence bucket
--     under {companyId}/branding/, embedded as a data URL on screen and in the PDF).
--  2. Six hourly rates on invoicing_config (Care, Sit, Overnight, Sleep, Shopping,
--     Cleaning), edited in Settings -> Invoicing. Twelve invoice line templates are
--     DERIVED in the app from these: each service x {Single Handed x1, Double
--     Handed x2}. becarecompliant project ONLY.

alter table public.companies add column if not exists logo_path text;

alter table public.invoicing_config
  add column if not exists rate_care_pence integer not null default 0 check (rate_care_pence >= 0),
  add column if not exists rate_sit_pence integer not null default 0 check (rate_sit_pence >= 0),
  add column if not exists rate_overnight_pence integer not null default 0 check (rate_overnight_pence >= 0),
  add column if not exists rate_sleep_pence integer not null default 0 check (rate_sleep_pence >= 0),
  add column if not exists rate_shopping_pence integer not null default 0 check (rate_shopping_pence >= 0),
  add column if not exists rate_cleaning_pence integer not null default 0 check (rate_cleaning_pence >= 0);
