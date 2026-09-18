import "server-only";

/**
 * Be Care Compliant — closing the booking a completed Check was booked as.
 *
 * WHY (Phil, 2026-09-08): "when a form is completed for a booked task, the task in the
 * planner should be green." Booking a spot check and then doing it were two unconnected
 * acts: the Check advanced and the booking sat on the whiteboard as planned work
 * forever, so the board showed a month of appointments that had all already happened.
 *
 * A visit carries a LIST of jobs (planner_booking_tasks, 0298), so completing a Check
 * closes the JOB it was booked as, and the visit follows only when every job on it is
 * done -- a carer who does the supervision and leaves the spot check for another day has
 * a visit that is still open, and the board says so. Only PLANNED jobs are closed: a
 * cancelled one stays cancelled, and one already completed is not restamped.
 *
 * NOT called when the Form was stood down. A spot check that could not be completed
 * leaves the Check due and the booking planned, because the visit still has to happen -
 * turning that task green would tell a manager the work was done.
 *
 * Best effort. It runs on the caller's own client so RLS decides, and a failure is
 * swallowed on purpose: the Evidence is already stored and the Check already advanced,
 * and refusing the whole completion because a calendar chip stayed gold would be a much
 * worse outcome than a stale chip.
 */

import type { createClient } from "@/lib/supabase/server";
import { rollUpVisit } from "@/lib/planner/roll-up";

/** Close the jobs these task rows belong to, then re-read each visit's own status. */
async function settle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  closed: Array<{ booking_id: string }> | null,
  userId: string,
): Promise<void> {
  for (const bookingId of new Set((closed ?? []).map((r) => r.booking_id))) {
    await rollUpVisit(supabase, bookingId, userId);
  }
}

export async function closeBookingsForCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checkInstanceId: string,
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("planner_booking_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("check_instance_id", checkInstanceId)
    .eq("status", "planned")
    .select("booking_id");
  await settle(supabase, data as Array<{ booking_id: string }> | null, userId);
}

/**
 * The same, for a tracker form. Probation, DBS and Right to Work are booked by form key
 * rather than by check instance (0243), so a completed Probation Review closes the task
 * that was booked for it and the whiteboard chip goes green like any other.
 */
export async function closeBookingsForTrackerForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  trackerFormKey: string,
  userId: string,
): Promise<void> {
  /* A tracker form has no check instance to match on, so the person is matched through the
     visit the job sits on. Read first, then close by id: the job table does not carry the
     person, and duplicating them onto it would be a second place for them to disagree. */
  const { data: mine } = await supabase
    .from("planner_booking_tasks")
    .select("id, booking:planner_bookings!inner(subject_person_id)")
    .eq("tracker_form_key", trackerFormKey)
    .eq("status", "planned")
    .eq("booking.subject_person_id", personId);
  const ids = ((mine as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  const { data } = await supabase
    .from("planner_booking_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .in("id", ids)
    .select("booking_id");
  await settle(supabase, data as Array<{ booking_id: string }> | null, userId);
}
