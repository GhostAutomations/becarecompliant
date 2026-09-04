-- 0214 — an email can be deleted, and put back
--
-- Phil, 2026-09-04: "there is no dele option, i need to be able to delete all the test emails".
--
-- TWO STEPS, LIKE EVERY MAIL CLIENT, and for the same reason a company gets thirty days before
-- it is purged (0209): the one thing you cannot undo is the thing you will one day do by
-- accident. Delete moves a message to Deleted Items. Erasing it for good is a separate,
-- deliberate act taken from inside that folder.
--
-- It matters more here than in most inboxes. This table IS the archive — Resend forgets received
-- mail after 30 days, so a message erased here is gone from the world, not just from a view.

alter table public.founder_emails
  add column if not exists deleted_at timestamptz;

comment on column public.founder_emails.deleted_at is
  'Moved to Deleted Items. The row survives until it is erased on purpose from that folder — a customer email is not something to lose to a stray click.';

-- Every folder except Deleted Items asks the same question first: not deleted, newest first.
create index if not exists founder_emails_live_idx
  on public.founder_emails (occurred_at desc)
  where deleted_at is null;
