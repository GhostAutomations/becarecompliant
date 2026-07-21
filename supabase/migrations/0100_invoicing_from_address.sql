-- 0100_invoicing_from_address
-- The head office / branch address printed under the company name on invoices.
-- Free text so a company can show head office or a specific branch as they like.
alter table public.invoicing_config
  add column if not exists from_address text;
