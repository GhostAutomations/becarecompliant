-- 0047_meeting_conducted_by
-- Phase 6 (Phil, 2026-07-12): the Book meeting box gets a required "who is
-- holding the meeting" dropdown, limited to Managers and Company Admins. The
-- chosen conductor is named in the employee's formal letter, receives the
-- conductor invitation (instead of defaulting to the line manager), and is
-- notified of the employee's accept/decline response.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_meetings
  add column if not exists conducted_by uuid references public.profiles(id) on delete set null;
