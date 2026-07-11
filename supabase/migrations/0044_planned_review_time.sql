-- 0044_planned_review_time
-- Phase 6 (Phil, 2026-07-12, live testing): a Planned Review booking needs a
-- TIME and DURATION, not an all-day event. The booking popover collects them
-- and the reviewer's .ics becomes a timed Europe/London event.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.service_user_trackers
  add column if not exists planned_review_time time,
  add column if not exists planned_review_duration_minutes int
    check (planned_review_duration_minutes is null or planned_review_duration_minutes between 15 and 480);
