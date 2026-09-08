import "server-only";

/**
 * Be Care Compliant — closing the booking a completed Check was booked as.
 *
 * WHY (Phil, 2026-09-08): "when a form is completed for a booked task, the task in the
 * planner should be green." Booking a spot check and then doing it were two unconnected
 * acts: the Check advanced and the booking sat on the whiteboard as planned work
 * forever, so the board showed a month of appointments that had all already happened.
 *
 * A booking carries the check_instance_id it was made for, so completing that instance
 * is the same event. Only PLANNED bookings are closed: a cancelled one stays cancelled,
 * and one already completed is not restamped.
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

export async function closeBookingsForCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checkInstanceId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("planner_bookings")
    .update({ status: "completed", updated_by: userId })
    .eq("check_instance_id", checkInstanceId)
    .eq("status", "planned");
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
  await supabase
    .from("planner_bookings")
    .update({ status: "completed", updated_by: userId })
    .eq("subject_person_id", personId)
    .eq("tracker_form_key", trackerFormKey)
    .eq("status", "planned");
}
