/**
 * The due date beside a booking on the Whiteboard (Thistle, via Phil 2026-10-05: once a task
 * was put on the board it lost its due date). Pure and importless so node --test can load it.
 */

/** The date a visit answers to: the earliest due date among its tasks that are not done yet.
 *  A visit is late as soon as its first job is, so the soonest one is the one to show. */
export function earliestDue(dates: ReadonlyArray<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const d of dates) if (d && (!best || d < best)) best = d;
  return best;
}

/**
 * Red: the due date has gone by. Amber: still in date today, but the booking is for after it,
 * so it will be late when it happens. Otherwise nothing: on time, or no due date to compare.
 */
export function dueTone(dueIso: string | null, scheduledIso: string, todayIso: string): "red" | "amber" | null {
  if (!dueIso) return null;
  if (dueIso < todayIso) return "red";
  if (scheduledIso > dueIso) return "amber";
  return null;
}
