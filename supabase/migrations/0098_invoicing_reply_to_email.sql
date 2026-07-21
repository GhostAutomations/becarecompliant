-- 0098_invoicing_reply_to_email
-- A monitored reply-to address for invoice emails. The email is SENT from the
-- Be Care Compliant address, but when a client hits Reply it goes here (the
-- company's own inbox) instead of a no-reply address.
alter table public.invoicing_config
  add column if not exists reply_to_email text;
