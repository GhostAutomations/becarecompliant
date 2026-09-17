/**
 * Be Care Compliant - the columns one check contributes to an import template.
 *
 * Pure and deliberately IMPORTLESS, like lib/training/renewal.ts, so the header plan the
 * template writes and the parser reads can be unit tested without a database or a session.
 *
 * WHY A DUE DATE BESIDE EVERY COMPLETION (Phil, 2026-09-16: "add in and due and comp
 * columns"). We used to collect completions only and recalculate every due date from our
 * own recurrence rule. Real data broke that twice in a week: the rules disagree with the
 * board a company arrives from (Spot Check is 30 days here, 28 there), so the imported
 * register contradicts the system it was copied from on day one; and a completion with no
 * due date beside it can never answer "was it done on time". A history that cannot be
 * judged late reads as a history where nothing ever was.
 *
 * THE THREE SHAPES, and why they differ:
 *
 *   ONE OFF check. Exactly one instance ever exists, so its due date IS the record's due
 *   date whether or not it has been done. Two columns, no "next due": a column that can
 *   never be filled is a column somebody eventually fills wrongly.
 *
 *   RECURRING check. "<name> next due date" carries the OPEN check's date, then one
 *   (due, completed) pair for the history.
 *
 *   RECURRING check with history (Supervision, Care Plan Review). As above, but the pair
 *   repeats, numbered, 1 = most recent. Enough slots for two years, capped at eight.
 *
 * The completed headers are byte for byte what they were before this file existed, so a
 * template somebody downloaded last week still imports.
 */

export const HISTORY_CAP = 8;

/** The checks whose history is worth more than one column. */
const HISTORY_KEYS = new Set(["supervision", "care_plan_review"]);

/** How many days one recurrence interval is, for deciding how many history slots fit. */
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

/** One completion and the date it was due. */
export type CheckSlot = { dueHeader: string; doneHeader: string };

export type CheckHeaderPlan = {
  /**
   * The column carrying which SLOT the most recent completion occupied on the system this
   * history came from. Only for a history check, and only meaningful for a company migrating
   * from a board that runs fixed, rotating slots.
   *
   * The slots rotate, so one number fixes them all: the completion before the most recent is
   * one slot back, and the outstanding one is the slot after. It cannot be worked out from
   * the dates - two records with identical intervals can sit on different phases of the
   * rotation - so it is carried or it is lost.
   */
  slotHeader: string | null;
  /** The open check's due date. Null for a one off, which has no next. */
  nextDueHeader: string | null;
  /** Newest first. */
  slots: CheckSlot[];
  /** Every header this check contributes, in file order. */
  headers: string[];
};

/** How many history slots this check gets. One unless it is a history check with room. */
function slotCount(key: string, recurring: boolean, days: number): number {
  if (!recurring || days <= 0 || !HISTORY_KEYS.has(key)) return 1;
  return Math.min(Math.max(1, Math.ceil(730 / days)), HISTORY_CAP);
}

export function checkHeaderPlan(
  key: string,
  name: string,
  recurring: boolean,
  days: number,
): CheckHeaderPlan {
  const n = slotCount(key, recurring, days);
  const slots: CheckSlot[] =
    n > 1
      ? Array.from({ length: n }, (_, i) => ({
          dueHeader: `${name} ${i + 1} due date`,
          doneHeader: `${name} ${i + 1}`,
        }))
      : [{ dueHeader: `${name} due date`, doneHeader: `${name} completed date` }];

  const nextDueHeader = recurring ? `${name} next due date` : null;
  const slotHeader = n > 1 ? `${name} 1 slot` : null;
  const headers = [
    ...(nextDueHeader ? [nextDueHeader] : []),
    ...(slotHeader ? [slotHeader] : []),
    ...slots.flatMap((s) => [s.dueHeader, s.doneHeader]),
  ];
  return { nextDueHeader, slotHeader, slots, headers };
}
