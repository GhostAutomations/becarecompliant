/**
 * Be Care Compliant — which People checks are dated from the start date when a record is added.
 *
 * Everything else (supervision, appraisal, manual handling, medication competency) starts blank
 * and is scheduled through completion or manually (Phil, 2026-07-09). Spot Check has always been
 * dated from the start.
 *
 * AUDIT TOO (Phil, 2026-09-23, Operation Thistle, point 10). A new starter at Thistle on 16/09
 * had an Audit with no due date, so it could never turn amber or red: nothing
 * dated it until the first one was done, and nothing would prompt the first one. A new starter's
 * first Audit is now due one Audit interval after they start, the same rule as Spot Check.
 *
 * initialDueDate in logic.ts asks this, and every path that dates a record from its start date
 * asks initialDueDate: Add a person, the import, a moved start date, a new job title and saving
 * the check in Settings. Pure and importless so it can be unit tested.
 */

export const DATED_FROM_START: ReadonlySet<string> = new Set(["spot_check", "audit"]);

export function datedFromStart(checkKey: string): boolean {
  return DATED_FROM_START.has(checkKey);
}

/**
 * Does the start date set this check's due date? Only then may a moved start date, or a saved
 * check setting, re-date a record that has not done it yet. For every other check (Supervision
 * runs from probation end and each appraisal, an expiry check from its expiry) the start date
 * says nothing, so its due date is left as it is. Re-dating those from the start date wrote a
 * blank over a real Supervision due date (found testing audit step 7, Phil 12 Oct 2026).
 */
export function startSetsDue(checkKey: string, anchor: string | null | undefined): boolean {
  return datedFromStart(checkKey) && anchor !== "expiry";
}
