-- 0463: an optional DATE on each invoice line (Phil, 2026-10-13, all companies; docs/decisions/invoicing.md).
--
-- Printed in a Date column left of Service ("Mon 05/10/2026") on the invoice page and the PDF, only
-- when at least one line has a date, so every invoice already sent prints exactly as it was. Nothing
-- fills it automatically: "Fill lines from care plan" keeps its week headings and leaves it blank,
-- and recurring invoices (invoice_schedule_lines) carry no date.
--
-- A new nullable column only: no existing row changes, no policy, function or trigger changes.
-- Safe to run twice.

alter table public.invoice_lines
  add column if not exists service_date date;

comment on column public.invoice_lines.service_date is
  'The day this line is for, optional (0463). Shown in a Date column left of Service when any line on the invoice has one.';
