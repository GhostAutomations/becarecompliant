/**
 * Be Care Compliant — custom register columns (Item 4, Phase 10 Additions).
 *
 * The People and Service User register matrices render a fixed, hand-authored set
 * of curated columns (Supervision, DBS, Care Plan Review, etc.). Any OTHER active
 * check definition (a custom check type created in Settings, or a seeded check with
 * no curated column) can be shown as its own extra column, in an Admin-controlled
 * order. This module is the single source of truth for which keys are curated (and
 * therefore excluded from the extra columns) plus the shared column type.
 */

/** Check keys that already have their own fixed columns in each register matrix, so
 *  they must NOT also appear as an extra/custom column. */
export const CURATED_CHECK_KEYS: Record<string, string[]> = {
  people: ["supervision", "appraisal", "spot_check", "competency", "manual_handling", "audit"],
  service_users: ["setup", "care_plan_review", "audit"],
};

export function isCuratedCheckKey(population: string, key: string): boolean {
  return (CURATED_CHECK_KEYS[population] ?? []).includes(key);
}

/** One custom check available as a register column. `show` drives whether it is
 *  currently rendered; the panel lists every one so hidden checks can be re-shown. */
export type RegisterCheckColumn = {
  id: string;
  key: string;
  name: string;
  show: boolean;
};
