-- 0465: a copy of each invoice email to the company's reply to address (Phil, 2026-10-13, all
-- companies; docs/decisions/invoicing.md). Ticked in Settings, Invoicing; off by default, so no
-- company starts getting copies it did not ask for.
--
-- A new column with a default only: no existing behaviour changes, no policy, function or
-- trigger changes. Safe to run twice.

alter table public.invoicing_config
  add column if not exists cc_reply_to boolean not null default false;

comment on column public.invoicing_config.cc_reply_to is
  'Copy (CC) every invoice email to reply_to_email (0465). Off by default.';
