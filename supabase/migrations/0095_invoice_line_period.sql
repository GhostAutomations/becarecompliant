-- 0095_invoice_line_period
-- Care plan billing is broken down by week: each invoice line covers one week of
-- the service period. Store that week's from/to dates on the line so the invoice,
-- its detail view and the branded PDF can group lines under a week header.
alter table public.invoice_lines
  add column if not exists period_start date,
  add column if not exists period_end date;

alter table public.invoice_schedule_lines
  add column if not exists period_start date,
  add column if not exists period_end date;
