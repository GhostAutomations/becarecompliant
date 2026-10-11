import "server-only";

/**
 * Be Care Compliant — the checks this login is booked on the Planner to carry out.
 *
 * A Recruiter completes a check only when they are the booked conductor of THAT check (Phil by
 * popup, 11 Oct 2026, after the step 7 review). The database holds the rule
 * (is_booked_conductor_for_check, 0444 section 4.1: a planned task for the check, on a planned
 * booking, with this login as conductor and somebody else as the booker); this reads the same
 * tasks through the caller's own RLS (a conductor reads their own bookings, 0444 section 13) so
 * the record, the register and the Complete page offer exactly what the database will accept.
 *
 * A failed read returns an empty set: the Recruiter is then told they are not booked, and the
 * database would refuse the same save anyway. Deduped per request by React cache().
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

type TaskRow = {
  check_instance_id: string | null;
  booking:
    | { conductor_profile_id: string; created_by: string | null; status: string }
    | Array<{ conductor_profile_id: string; created_by: string | null; status: string }>
    | null;
};

export const bookedCheckInstanceIds = cache(async (userId: string): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planner_booking_tasks")
    .select("check_instance_id, booking:planner_bookings!inner(conductor_profile_id, created_by, status)")
    .eq("status", "planned")
    .not("check_instance_id", "is", null)
    .eq("booking.conductor_profile_id", userId)
    .eq("booking.status", "planned");
  if (error) {
    console.error("[planner] could not read the checks this login is booked for", error.message);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of (data as TaskRow[] | null) ?? []) {
    const b = Array.isArray(row.booking) ? row.booking[0] : row.booking;
    // Booking yourself is never the permission (0183): the booker must be somebody else.
    if (!row.check_instance_id || !b || b.created_by === userId) continue;
    out.add(row.check_instance_id);
  }
  return out;
});
