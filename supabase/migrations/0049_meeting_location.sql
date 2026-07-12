-- 0049_meeting_location
-- Phase 6 (Phil, 2026-07-12): a booked absence meeting needs a LOCATION (an
-- office address or a video call such as Teams). Collected at booking and
-- rearrangement, shown in the formal letters, the .ics (LOCATION), the public
-- response page and the card.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_meetings
  add column if not exists location text;
