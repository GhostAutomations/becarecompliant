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
