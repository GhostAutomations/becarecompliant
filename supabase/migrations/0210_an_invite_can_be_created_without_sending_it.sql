-- 0210 — an invite can be created without sending it (Phil, 2026-08-19)
--
-- An invitation and an invitation EMAIL are two different events, and the product treated them
-- as one. A bulk import of forty carers therefore emailed forty people the moment it finished,
-- and whoever ran the import was thinking about data, not about forty replies that evening.
--
-- email_sent_at NULL now means "created, nobody has been told": Settings > Users shows it as
-- "Not sent yet" with a Send invite button, which goes through the existing resend path.

alter table public.invites add column if not exists email_sent_at timestamptz;

comment on column public.invites.email_sent_at is
  'When the invitation email actually went out. NULL means the invite exists but the person has not been told: created with "do not send yet" and waiting for somebody to press Send invite.';

-- Every invite that existed before this column was sent at creation, so backfill rather than
-- leaving history looking like a pile of unsent invitations.
update public.invites set email_sent_at = created_at where email_sent_at is null;

create index if not exists invites_unsent_idx
  on public.invites (company_id)
  where status = 'pending' and email_sent_at is null;
