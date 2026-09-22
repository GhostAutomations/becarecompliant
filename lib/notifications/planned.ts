/**
 * Be Care Compliant — is the thing that is due actually IN THE DIARY? Pure and IMPORTLESS, so
 * node --test can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-22): "on the daily email add a 4th column to the right of date,
 * call it something like planner, scheduled, planned - if it is not planned in, have a red X if
 * it is planned in, have the name of the person doing it and the date."
 *
 * The report has always answered "what is due". It has never answered the question a manager
 * actually asks next, which is "and has anybody been sent to do it". Four care plan reviews due
 * in a fortnight reads like a problem when three of them are already booked in, and reads like
 * nothing at all when none of them are.
 *
 * THE MATCH IS ON THE RECORD AND THE CHECK'S NAME, not on ids, and that is deliberate: the email
 * row comes from person_check_status (a view of instances) while the booking hangs off a task
 * row that may name its check in its own words. The name is what both of them agree on, and it
 * is what the reader sees in the Task column, so a match they can see is a match we can explain.
 * Names are compared case and space insensitively for the same reason.
 */

/** A booking, reduced to what the email needs. */
export type PlannedVisit = {
  /** Who is doing it. Null where the booking has lost its conductor (a leaver). */
  conductorName: string | null;
  /** ISO date it is booked for. */
  scheduledDate: string;
};

/** One planned check, as the data layer finds it. */
export type PlannedSource = PlannedVisit & {
  recordId: string;
  checkName: string;
};

/** The key both sides agree on: this record, this check, however either spells it. */
export function plannedKey(recordId: string, checkName: string): string {
  return `${recordId}|${checkName.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Index the bookings by record and check.
 *
 * THE EARLIEST ONE WINS where a check is booked more than once. A manager reading "due 24/09"
 * wants to know the next time somebody is going out, not the last: a visit booked for November
 * does not answer a deadline in September, and showing it would say the job is covered when it
 * is not.
 */
export function plannedIndex(rows: readonly PlannedSource[]): Map<string, PlannedVisit> {
  const out = new Map<string, PlannedVisit>();
  for (const r of rows) {
    if (!r.recordId || !r.checkName.trim() || !r.scheduledDate) continue;
    const key = plannedKey(r.recordId, r.checkName);
    const held = out.get(key);
    if (!held || r.scheduledDate < held.scheduledDate) {
      out.set(key, { conductorName: r.conductorName, scheduledDate: r.scheduledDate });
    }
  }
  return out;
}

/** The booking for this row, or null where nothing is in the diary for it. */
export function plannedFor(
  index: ReadonlyMap<string, PlannedVisit>,
  recordId: string,
  checkName: string,
): PlannedVisit | null {
  return index.get(plannedKey(recordId, checkName)) ?? null;
}
