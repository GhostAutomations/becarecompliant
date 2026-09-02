-- 0211 — a trial request never waits in silence
--
-- Two real care companies asked for a trial on 27 August 2026. Six days later both were still
-- status 'new' and Phil had received nothing at phil.davies@outlook.com. The code DID try to
-- email him (lib/marketing/actions.ts has notified the founder since it was written), but the
-- attempt was fire and forget: no record of whether it left, no record of why it did not, and
-- nothing whatsoever if it silently failed. The only thing on this platform that is genuinely
-- time critical was the only thing with no proof of delivery and no second attempt.
--
-- Nothing here changes who is emailed. It makes the attempt a FACT ON THE ROW, so the founder
-- console can say "we could not reach you about this one", and so a daily chase can keep going
-- until the request is actually dealt with.

alter table trial_requests
  add column if not exists founder_alerted_at timestamptz,
  add column if not exists founder_alert_error text,
  add column if not exists founder_chased_at timestamptz,
  add column if not exists founder_chase_count integer not null default 0;

comment on column trial_requests.founder_alerted_at is
  'When the founder alert email was accepted by the mail provider. NULL means it was never sent, or predates 0211 — either way it must not be presented as delivered.';
comment on column trial_requests.founder_alert_error is
  'Why the founder alert did not go: provider error, or the reason it was skipped. NULL with a NULL founder_alerted_at means we simply do not know.';
comment on column trial_requests.founder_chased_at is
  'Last time the daily chase reminded the founder this request is still waiting.';

-- The chase only ever looks at requests still waiting on the founder, so index exactly that.
create index if not exists trial_requests_waiting_idx
  on trial_requests (created_at)
  where status = 'new';

-- The three requests that already exist (two real companies, one duplicate submission) predate
-- this and their delivery genuinely is unknown. Say so explicitly rather than leaving a NULL that
-- a future reader could mistake for "never attempted".
update trial_requests
   set founder_alert_error = 'Not recorded: this request predates delivery recording (0211).'
 where founder_alerted_at is null
   and founder_alert_error is null;
