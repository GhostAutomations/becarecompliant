-- 0412: an AI draft is claimed while it is being approved ("approving"), so a double press or a
-- second tab cannot turn one draft into two policies (review, 2026-10-07).
alter table public.policy_drafts drop constraint if exists policy_drafts_status_check;
alter table public.policy_drafts add constraint policy_drafts_status_check
  check (status in ('draft', 'approving', 'approved', 'discarded'));
