-- 0045_absence_meeting_booking
-- Phase 6 (Phil, 2026-07-12, live testing): split "Book a meeting" (schedule a
-- future absence management meeting, sends the formal letter invitations with
-- a timed .ics) from "Record meeting" (log a meeting once it has happened, no
-- invitations). A booking is an absence_meetings row WITHOUT evidence; recording
-- attaches the Evidence to the open booking (or inserts if none). Booked
-- meetings count towards the person's meeting stage (Phil's choice), so the
-- existing max(stage) derivation needs no change.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_meetings
  add column if not exists meeting_time time,
  add column if not exists duration_minutes int
    check (duration_minutes is null or duration_minutes between 15 and 480),
  add column if not exists booked_by uuid references auth.users(id) on delete set null;

-- Recording updates the open booking row (previously insert-only).
create policy absence_meetings_update on public.absence_meetings
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  )
  with check (public.is_company_member(company_id));
