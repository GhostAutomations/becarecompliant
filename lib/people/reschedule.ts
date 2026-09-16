/**
 * Be Care Compliant — which checks re-date themselves when their cadence changes.
 *
 * Pure and import free so it can be unit tested: this is the DECISION, the date maths
 * stays in the recurrence engine.
 *
 * Editing a check's cadence in Settings used to reschedule only the records that had
 * never completed it. Everybody who HAD completed it kept the due date the old interval
 * produced, and due_date is stored rather than derived, so nothing ever corrected it:
 * change the audit from monthly to quarterly and the only people who move are the ones
 * who have never been audited. The register then disagrees with the setting that is
 * sitting right there on screen.
 *
 * Not every check re-dates, though, and getting that wrong invents due dates:
 *  - an EXPIRY anchor is dated from a document, not from a completion;
 *  - a NON-RECURRING check is finished when it is done (a completed Setup Visit is not
 *    due again), and its interval is a negative offset that the engine would reject;
 *  - the Annual Appraisal on "after supervision 3" is scheduled by the third supervision
 *    of the cycle, and its own backfill owns that;
 *  - an interval below 1 is not a cadence.
 */

export type ReschedulableCheck = {
  recurring: boolean;
  anchor: "completion" | "expiry" | null;
  schedule_mode: "interval" | "after_sup3" | "ad_hoc";
  frequency: string | null;
  interval: number | null;
};

export function reschedulesOnCompletion(def: ReschedulableCheck): boolean {
  if (!def.recurring) return false;
  if (def.anchor === "expiry") return false;
  if (def.schedule_mode === "after_sup3") return false;
  if (!def.frequency) return false;
  return typeof def.interval === "number" && def.interval >= 1;
}
