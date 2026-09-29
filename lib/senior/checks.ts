/**
 * Be Care Compliant: the Check boxes under People and Service users on the Senior tile (0339).
 *
 * Phil, 2026-09-29: under People and Service users, a box per Check; "if people and service users
 * ticked, then [the] boxes underneath should be active and ticked". A ticked Check lets a Senior
 * see it and complete it. A Check the company adds later starts ticked, so what is stored is what
 * is switched OFF (senior_check_access_off), exactly like the departments.
 *
 * Pure and importless so node --test can load it.
 */

export const SENIOR_CHECK_FIELD = "senior_checks";

export type SeniorPopulation = "people" | "service_users";
export const SENIOR_POPULATIONS: readonly SeniorPopulation[] = ["people", "service_users"];

/**
 * The Checks to switch OFF for one list, from the active Checks and the boxes that arrived ticked.
 * Null means "leave this list's Checks exactly as they are": the list itself was unticked, its
 * boxes were greyed and so not posted, and reading that as "all off" would lose the Admin's
 * choices the moment they untick People for a day.
 */
export function seniorChecksOff(
  listTicked: boolean,
  activeCheckIds: readonly string[],
  tickedCheckIds: ReadonlySet<string>,
): string[] | null {
  if (!listTicked) return null;
  return activeCheckIds.filter((id) => !tickedCheckIds.has(id));
}

/**
 * The columns a list's Checks sit in on the Senior tile, filled down the left first
 * (Phil, 2026-09-29). More than five: three columns, the spare ones going to the left, so
 * People's ten are four, three and three and the tile is the height of the Viewer tile. Five or
 * fewer: one column on the left (Service users).
 */
export const SENIOR_CHECK_COLUMNS = 3;

export function splitColumns<T>(checks: readonly T[]): T[][] {
  if (checks.length <= 5) return [[...checks]];
  const base = Math.floor(checks.length / SENIOR_CHECK_COLUMNS);
  const extra = checks.length % SENIOR_CHECK_COLUMNS;
  const out: T[][] = [];
  let at = 0;
  for (let c = 0; c < SENIOR_CHECK_COLUMNS; c++) {
    const size = base + (c < extra ? 1 : 0);
    out.push(checks.slice(at, at + size));
    at += size;
  }
  return out;
}
