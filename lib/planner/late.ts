/**
 * Be Care Compliant — a booked task whose slot has been and gone.
 *
 * WHY (Phil, 2026-09-08): "the 12:30 appointment was for 30m so has passed, it was not
 * completed, so in the planner only it should be red." A planned task sat on the board in
 * the same neutral chip whether it was this afternoon or last Tuesday, so a manager
 * scanning the month could not see what had been missed without reading every time.
 *
 * IN THE PLANNER ONLY. This says nothing about compliance: a spot check booked for
 * Tuesday and not done is a missed appointment, while the check itself may not be due for
 * another three weeks. The check's own RAG is untouched and stays the one that decides
 * whether a company is compliant.
 *
 * A task with no time is not late until its DAY is over: "some time on Tuesday" has all of
 * Tuesday to happen in. A task with a time is late once its slot has finished, which is
 * why the duration is part of the sum rather than the start alone.
 *
 * Pure and self-contained (no imports) so it can be unit tested. The caller supplies today
 * and the time now, because a client component must not read the clock during render.
 */

export type LateBooking = {
  status: "planned" | "completed" | "cancelled";
  /** ISO yyyy-mm-dd. */
  scheduledDate: string;
  /** HH:MM, or null for a task with no time. */
  startTime: string | null;
  durationMinutes: number | null;
};

/** Minutes since midnight for HH:MM, or null when it is not a time. */
function minutesOf(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Has this booking's slot passed without it being done?
 *
 * `nowMinutes` is minutes since midnight, or null when the time of day is not known yet
 * (the first render before the client clock is read). Null is never late, so the server
 * and the browser agree on the first paint.
 */
export function bookingIsLate(
  booking: LateBooking,
  todayIso: string,
  nowMinutes: number | null,
): boolean {
  if (booking.status !== "planned") return false;
  if (booking.scheduledDate < todayIso) return true;
  if (booking.scheduledDate > todayIso) return false;
  // Today.
  if (nowMinutes === null) return false;
  if (!booking.startTime) return false;
  const start = minutesOf(booking.startTime);
  if (start === null) return false;
  const duration = booking.durationMinutes && booking.durationMinutes > 0 ? booking.durationMinutes : 0;
  return start + duration < nowMinutes;
}
