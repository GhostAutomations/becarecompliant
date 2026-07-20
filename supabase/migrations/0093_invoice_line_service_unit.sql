-- 0093_invoice_line_service_unit
-- Invoice lines now mirror the care plan columns: Service, Unit (a visit duration
-- or Fixed) and Quantity, with the amount derived from the company rates. Store
-- the service and unit label so the invoice can show the same columns. The
-- existing description / unit_price_pence / line_total_pence still hold the priced
-- values used for totals and the PDF. becarecompliant project ONLY.

alter table public.invoice_lines
  add column if not exists service text,
  add column if not exists unit_label text;

alter table public.invoice_schedule_lines
  add column if not exists service text,
  add column if not exists unit_label text;
