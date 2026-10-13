-- 0464: bank details as FOUR fields on invoicing_config (Phil, 2026-10-13, all companies;
-- docs/decisions/invoicing.md): Account Name, Bank, Account No, Sort Code, printed on every invoice
-- as the label, a gap, then the value, so the values line up.
--
-- The old free text (payment_details) stays as it is and still prints while all four are empty, so
-- no company's invoice goes blank before it fills the fields in. Settings no longer shows it.
--
-- New nullable columns only: no existing row changes, no policy, function or trigger changes.
-- Safe to run twice.

alter table public.invoicing_config
  add column if not exists bank_account_name text,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_sort_code text;

comment on column public.invoicing_config.bank_account_name is 'Account Name printed on invoices (0464).';
comment on column public.invoicing_config.bank_name is 'Bank printed on invoices (0464).';
comment on column public.invoicing_config.bank_account_number is 'Account No printed on invoices (0464).';
comment on column public.invoicing_config.bank_sort_code is 'Sort Code printed on invoices (0464).';
comment on column public.invoicing_config.payment_details is
  'The old free text bank details. Printed only while the four bank_ fields are all empty (0464).';
