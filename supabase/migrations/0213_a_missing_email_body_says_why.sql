-- 0213 — a missing email body says why
--
-- The first real email through the new inbox (3 Sep 2026) stored perfectly: sender, subject,
-- threading, and a reply that landed in the right Outlook thread. The BODY was null.
--
-- Cause: RESEND_API_KEY had "Sending access" only, and reading a received email needs Full
-- access. The webhook carries metadata alone, so the content always arrives on a second call —
-- and that call was refused.
--
-- The defect is not the permission. The defect is that a refused fetch left a silent NULL that
-- looks exactly like an email with no text in it. That is DEF-017 again, in a feature built to
-- fix DEF-017: an attempt whose outcome is not recorded is an attempt nobody can trust.

alter table public.founder_emails
  add column if not exists body_error text,
  add column if not exists body_fetched_at timestamptz;

comment on column public.founder_emails.body_error is
  'Why the message content could not be fetched from the provider. A NULL body with a NULL error means it was never attempted; neither is ever presented as "this email was empty".';
comment on column public.founder_emails.body_fetched_at is
  'When the content was successfully retrieved. The webhook carries metadata only, so the body always arrives on a second call.';

-- The nightly backfill asks one question: which received messages still have no body? Answer it
-- from an index that only carries those, because the provider deletes received mail after 30
-- days and a body we never collected stops existing.
create index if not exists founder_emails_needs_body_idx
  on public.founder_emails (occurred_at)
  where direction = 'in' and body_text is null and body_html is null;
