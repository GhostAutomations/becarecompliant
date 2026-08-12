/**
 * Be Care Compliant — do two Planner bookings collide?
 *
 * PURE, WITH NO RUNTIME IMPORTS, so the rule is unit testable and the server action, the
 * message the user reads, and the database exclusion constraints (migration 0180) all agree
 * on what "already busy" means.
 *
 * Phil, 2026-08-12: "look at akrams planner he is tripple booked on the 13th of august at
 * 10am, that shouldnt be allowed". Nothing anywhere checked. His follow up matters as much
 * as the original: "it also needs to check if the person / service user is booked as well so
 * another person can book something at the same time" — a conductor-only rule would still
 * let a SECOND manager book the same carer at the same moment.
 *
 * Windows are HALF OPEN: 10:00 for 30 minutes and 10:30 for 30 minutes are back to back,
 * not a clash. Getting that wrong would refuse an entire ordinary morning of visits.
 */

/** Minutes since midnight for "HH:MM" or "HH:MM:SS". Null for anything unusable, which the
 *  caller must treat as "no window", never as midnight. */
export function minutesFromMidnight(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** A booking occupies a window only if it has both a time and a positive duration. */
export function bookingWindow(
  startTime: unknown,
  durationMinutes: unknown,
): { start: number; end: number } | null {
  const start = minutesFromMidnight(startTime);
  if (start === null) return null;
  const duration =
    typeof durationMinutes === "number" && Number.isFinite(durationMinutes)
      ? Math.trunc(durationMinutes)
      : null;
  if (duration === null || duration <= 0) return null;
  return { start, end: start + duration };
}

/**
 * True when two bookings on the SAME DAY occupy overlapping time.
 *
 * An untimed booking never clashes with anything: it has no window. That is deliberate and
 * matches the database, where the constraints are `where start_time is not null`.
 */
export function bookingsOverlap(
  a: { startTime: unknown; durationMinutes: unknown },
  b: { startTime: unknown; durationMinutes: unknown },
): boolean {
  const aw = bookingWindow(a.startTime, a.durationMinutes);
  const bw = bookingWindow(b.startTime, b.durationMinutes);
  if (!aw || !bw) return false;
  return aw.start < bw.end && bw.start < aw.end;
}

/** "10:00" from "10:00:00", for a message somebody reads. */
export function displayTime(value: unknown): string {
  const minutes = minutesFromMidnight(value);
  if (minutes === null) return "";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
