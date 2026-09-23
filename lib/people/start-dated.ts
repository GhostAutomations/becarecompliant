/**
 * Be Care Compliant — which People checks are dated from the start date when a record is added.
 *
 * Everything else (supervision, appraisal, manual handling, medication competency) starts blank
 * and is scheduled through completion or manually (Phil, 2026-07-09). Spot Check has always been
 * dated from the start.
 *
 * AUDIT TOO (Phil, 2026-09-23, Operation Thistle item 10). Damilola Quadri-Eleruja started at
 * Thistle on 16/09 and her Audit had no due date, so it could never turn amber or red: nothing
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
