-- 0048_meeting_booking_cancel
-- Phase 6 (Phil, 2026-07-12): a booked meeting needs a cancel path (rebook =
-- cancel + book again). Cancelling DELETES the open booking row (it must not
-- keep counting towards the meeting stage); the letters already sent are
-- recorded in notification_log and the cancellation is audited. Only open
-- bookings (no Evidence) can be deleted, and only by an Admin or the branch
-- Manager; recorded meetings are immutable history.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create policy absence_meetings_delete on public.absence_meetings
  for delete to authenticated
  using (
    evidence_id is null
    and (
      public.is_platform_admin()
      or public.is_company_admin(company_id)
      or (branch_id is not null and public.is_branch_manager(branch_id))
    )
  );
