-- 0096_invoicing_company_number
-- Companies House number, shown in the invoice footer. When set it replaces the
-- previous "VAT welfare exemption" footer note.
alter table public.invoicing_config
  add column if not exists company_number text;
