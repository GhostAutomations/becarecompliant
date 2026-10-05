/**
 * Be Care Compliant — the creation tick list (Phil, 2026-09-26 spec, built 2026-10-01).
 *
 * Thistle's set up is the default every new company gets. On Founder > Create a company the
 * founder can untick the checks and training courses a customer will not use. The register
 * columns FOLLOW the checks (Phil, 2026-10-01): untick a check and its columns leave the register
 * too; a company bringing its own forms gets its columns renamed on the company page instead.
 *
 * IMPORTLESS ON PURPOSE: the unit test target for the pure rules (what gets skipped, which
 * columns belong to which check).
 */

export type SetupCheck = {
  population: "people" | "service_users";
  key: string;
  name: string;
  formName: string | null;
  adHoc: boolean;
  columns: string[];
  lockedReason: string | null;
};

export type SetupForm = { key: string; name: string; lockedReason: string; columns: string[] };
export type SetupCourse = { id: string; name: string; mandatory: boolean };

export type SetupCatalogue = {
  checks: SetupCheck[];
  lockedForms: SetupForm[];
  courses: SetupCourse[];
};

/** The register columns each default check brings with it, as the register labels them. */
export const CHECK_COLUMNS: Record<string, Record<string, string[]>> = {
  people: {
    supervision: ["Supervision 1 to 3 Due and Done"],
    appraisal: ["Annual Appraisal Due", "Annual Appraisal Done"],
    spot_check: ["Spot Check Due", "Recent Spot Check"],
    competency: ["Medication Competency"],
    manual_handling: ["Manual Handling"],
    audit: ["Audit"],
  },
  service_users: {
    setup: ["Setup Visit Due", "Setup Visit Completed"],
    care_plan_review: ["Review 1 to 4 Due and Done", "Most Recent Review", "New Review Due"],
    audit: ["Audit"],
  },
};

/** Columns that belong to a locked form rather than a check, shown so nothing is a surprise. */
export const FORM_COLUMNS: Record<string, string[]> = {
  dbs_renewal: ["DBS date of issue", "Enhanced DBS"],
  right_to_work: ["RTW Expiry", "RTW Limits"],
  probation_review: ["Probation End Due", "Probation End Actual", "Probation Status", "Probation Extension"],
};

export function columnsForCheck(population: string, key: string): string[] {
  return CHECK_COLUMNS[population]?.[key] ?? [];
}

/**
 * What the founder left unticked. Only the boxes that were ticked arrive with the form, so the
 * skip list is "everything offered, less what came back". If the list was never on the screen
 * (`shown` false), NOTHING is skipped: a page that failed to draw must never create an empty
 * company. Locked keys are never skipped whatever is sent (the database refuses as well).
 */
export function skippedKeys(
  offered: string[],
  kept: string[],
  locked: string[],
  shown: boolean,
): string[] {
  if (!shown) return [];
  const keep = new Set(kept);
  const lock = new Set(locked);
  return offered.filter((k) => !keep.has(k) && !lock.has(k));
}

/** Curated register columns to draw: all of them when the company's checks are unknown. */
export function showsColumn(present: string[] | undefined, key: string): boolean {
  return present === undefined || present.includes(key);
}
