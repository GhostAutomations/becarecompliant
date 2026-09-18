/**
 * Be Care Compliant — whose date is a supplied "Due" when the sheet gives a Due and a
 * Done for the same event?
 *
 * A board column pair reads "Annual Appraisal Due 03/07/2026 / Annual Appraisal Done
 * 03/07/2026". We imported the Due as the NEXT due and the Done as the completion, which
 * says the appraisal is outstanding on the very day it was signed off -- and it stayed
 * that way, ageing by a day every morning, in every report that reads the stored date.
 *
 * A due date its own completion has already met is not a next due. It is the date that
 * completion was due, which is worth keeping (it is how "on time" is graded), and what
 * comes next is for the check's own rule to say. For an appraisal scheduled after
 * Supervision 3 the rule says nothing comes next until the next Supervision 3 is done,
 * which is exactly what completing one in the app produces.
 *
 * Pure and importless so it can be tested; the parser is server-only.
 */

export type SettledDue = {
  /** The date to carry forward as the check's next due, or null for "not scheduled". */
  nextDue: string | null;
  /** The date that COMPLETION was due, kept as history, or null when unknown. */
  completionDue: string | null;
};

/** Decide where a supplied Due belongs, given the newest supplied completion.
 *  Dates are ISO (YYYY-MM-DD), so a string compare is a date compare. */
export function settleSuppliedDue(
  suppliedDue: string | null | undefined,
  latestCompletion: string | null | undefined,
): SettledDue {
  const due = suppliedDue ?? null;
  const done = latestCompletion ?? null;
  if (!due) return { nextDue: null, completionDue: null };
  // Scheduled but never done: the sheet is describing something still outstanding.
  if (!done) return { nextDue: due, completionDue: null };
  // Met on or before the day it fell due -- and late still counts as met, because the
  // completion is the last thing that happened to that deadline.
  if (due <= done) return { nextDue: null, completionDue: due };
  return { nextDue: due, completionDue: null };
}

/** Whole days from one ISO date to another. Positive = the second is later. */
function daysApart(fromIso: string, toIso: string): number {
  const a = Date.UTC(Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)) - 1, Number(fromIso.slice(8, 10)));
  const b = Date.UTC(Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10)));
  return Math.round((b - a) / 86400000);
}

/**
 * Does a supplied Due belong to the completion beside it, or has it already rolled forward?
 *
 * WHY (found on Amanda Ford's record, 2026-09-18). A board laid out slot by slot keeps last
 * cycle's completion in a slot until it is redone, while that slot's Due has already moved on
 * to the next time round. Pairing the two says a review done in March was due in November --
 * on time by eight months. Eleven supervisions and three care plan reviews came in that way,
 * with gaps of 231 to 369 days, and PQS grades a migrated completion against exactly this date.
 *
 * The parser already tried to catch it by nulling the Due of the slot it worked out was open,
 * as (newest completed slot % slots) + 1. On Amanda that was Review 3; the slot that needed it
 * was Review 4. Guessing WHICH slot is open cannot be made reliable -- but the dates say it
 * outright, so ask them instead:
 *
 *   - a Due on or before the Done was met by it, late or on the day. It belongs.
 *   - a Due AFTER the Done by less than a full cycle is that same event, done early. It belongs.
 *   - a Due a whole cycle or more after the Done is the NEXT one. We were not told when this
 *     completion was due, so we do not claim to know.
 */
export function dueBelongsToCompletion(
  suppliedDue: string | null | undefined,
  completedOn: string | null | undefined,
  cycleDays: number | null | undefined,
): boolean {
  const due = suppliedDue ?? null;
  const done = completedOn ?? null;
  if (!due || !done) return false;
  if (due <= done) return true;
  // No fixed cadence to judge by (an ad hoc check): take the sheet at its word.
  if (cycleDays == null || cycleDays <= 0) return true;
  return daysApart(done, due) < cycleDays;
}
