/**
 * Be Care Compliant - the columns one check contributes to an import template.
 *
 * Pure and deliberately IMPORTLESS, like lib/training/renewal.ts, so the header plan the
 * template writes and the parser reads can be unit tested without a database or a session.
 *
 * THE TEMPLATE IS THE MATRIX (Phil, 2026-09-17: "when some presses the download template,
 * the columns on the template match the columns in the matrix").
 *
 * Every check contributes a DUE column and a DONE column, named as the register names them,
 * in the order the register shows them. A history check - Supervision, Care Plan Review -
 * contributes one pair per slot in its rotation, numbered exactly as the register numbers
 * them. Nothing else.
 *
 * WHAT THAT DELETED, and why it is worth it. The old template had three inventions that
 * existed only because its shape did not match the register: a "next due date" column, a
 * "slot" column saying which slot the most recent completion sat in, and a most-recent-first
 * numbering that meant Care Plan Review 1 was a different review for every person. All three
 * are now implied by WHERE a date sits:
 *
 *   - the slot IS the column, so nothing has to be carried or rotated;
 *   - the outstanding review is the slot after the newest completion, so its Due needs no
 *     column of its own;
 *   - a review stays in its own slot, so Review 1 means the same thing on every row and
 *     against the board it came from.
 *
 * One rule, no conventions to remember, and a filled sheet you can read straight across
 * against the register it will become.
 */

/** How many slots a rotating history check has. The register draws four. */
export const ROTATION_SLOTS = 4;

/** The checks whose history runs as numbered, rotating slots. */
const HISTORY_KEYS = new Set(["supervision", "care_plan_review"]);

/** What the REGISTER calls a check, where that differs from the check's own name. */
const MATRIX_LABEL: Record<string, string> = { care_plan_review: "Review" };

/** How many days one recurrence interval is, used only to tell a real cycle from a stub. */
export function intervalDays(frequency: string | null, interval: number | null): number {
  const n = interval && interval > 0 ? interval : 0;
  switch (frequency) {
    case "week":
      return n * 7;
    case "month":
      return n * 30;
    case "year":
      return n * 365;
    default:
      return n;
  }
}

/** One slot: the date it was due and the date it was done, as the register shows them. */
export type CheckSlot = { dueHeader: string; doneHeader: string };

export type CheckHeaderPlan = {
  /** Numbered, rotating slots (Supervision, Care Plan Review) rather than a single pair. */
  isHistory: boolean;
  /**
   * A ONE OFF check has exactly one instance ever, so the date in its Due column IS that
   * instance's deadline, done or not. For anything recurring the Due column is the NEXT
   * one, exactly as the register draws it.
   */
  isOneOff: boolean;
  slots: CheckSlot[];
  headers: string[];
};

export function checkHeaderPlan(
  key: string,
  name: string,
  recurring: boolean,
  days: number,
  rotation = ROTATION_SLOTS,
): CheckHeaderPlan {
  const isHistory = recurring && days > 0 && HISTORY_KEYS.has(key) && rotation > 1;
  const label = MATRIX_LABEL[key] ?? name;
  const slots: CheckSlot[] = isHistory
    ? Array.from({ length: rotation }, (_, i) => ({
        dueHeader: `${label} ${i + 1} Due`,
        doneHeader: `${label} ${i + 1} Done`,
      }))
    : [{ dueHeader: `${label} Due`, doneHeader: `${label} Done` }];
  return {
    isHistory,
    isOneOff: !recurring,
    slots,
    headers: slots.flatMap((s) => [s.dueHeader, s.doneHeader]),
  };
}
