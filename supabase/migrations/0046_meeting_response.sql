-- 0046_meeting_response
-- Phase 6 (Phil, 2026-07-12): Accept / Decline on the absence meeting
-- invitation. Staff have no logins, so the employee letter carries secure
-- personal links to a public response page keyed by an unguessable token.
-- Accept is one click; Decline requires a reason. The response is stored on
-- the meeting, the booker is notified, and the Absence card shows it.
-- The token is the capability: the public page reads/writes via the service
-- role ONLY by exact token match; no anon RLS policies are added.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_meetings
  add column if not exists response_token uuid not null default gen_random_uuid(),
  add column if not exists response text
    check (response is null or response in ('accepted', 'declined')),
  add column if not exists response_reason text,
  add column if not exists responded_at timestamptz;

create unique index if not exists absence_meetings_response_token_idx
  on public.absence_meetings (response_token);
