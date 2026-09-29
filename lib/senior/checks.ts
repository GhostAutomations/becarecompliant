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
