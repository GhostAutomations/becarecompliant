import "server-only";

/**
 * Be Care Compliant — a visit's status, read off the jobs on it.
 *
 * Two things close a visit and both come through here: completing the last Check on it
 * (lib/planner/close-booking.ts), and editing its job list (lib/planner/actions.ts). One
 * function so the two can never disagree about what "done" means.
 */

import type { createClient } from "@/lib/supabase/server";
import { visitIsComplete } from "@/lib/planner/visit";

/**
 * The visit's own status, read off its jobs.
 *
 * Phil's rule: a visit is finished when every job on it is, and not before, so a visit
 * with two of three done stays open (see lib/planner/visit.ts). Also runs in reverse: put
 * a new job on a visit that had been closed and the visit reopens, because there is work
 * on it again.
 */
export async function rollUpVisit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  userId: string,
): Promise<void> {
  const { data: booking } = await supabase
    .from("planner_bookings")
    .select("status")
    .eq("id", bookingId)
    .maybeSingle();
  // A cancelled visit stays cancelled; its jobs do not un-cancel it.
  if (!booking || booking.status === "cancelled") return;

  const { data } = await supabase
    .from("planner_booking_tasks")
    .select("status")
    .eq("booking_id", bookingId);
  const statuses = ((data as Array<{ status: "planned" | "completed" | "cancelled" }> | null) ?? []).map((t) => t.status);
  if (statuses.length === 0) return;
  const next = visitIsComplete(statuses) ? "completed" : "planned";
  if (next === booking.status) return;
  await supabase.from("planner_bookings").update({ status: next, updated_by: userId }).eq("id", bookingId);
}
