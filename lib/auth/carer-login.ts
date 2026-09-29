/**
 * Carer logins: the two roles whose home is their own area (My area) rather than the office
 * product (Phil, 2026-09-29).
 *
 *   staff   "Team Member": a carer's own login, and only their own area.
 *   senior  "Senior": a carer's own login PLUS a list of names, People and or Service Users
 *           from their own branches, as ticked on the Senior tile in Role access, with the
 *           Checks ticked under each list against every name: status, due date, and a
 *           Complete button (0339). No records, contact details or past Evidence. The list
 *           comes from the database function senior_register, never from the people or
 *           service_users tables, which a Senior reads exactly as a carer does.
 *
 * Both are free, never paid users. Pure and importless so node --test can load it.
 */

export const CARER_LOGIN_ROLES = ["staff", "senior"] as const;

export function isCarerLogin(role: string | null | undefined): boolean {
  return role === "staff" || role === "senior";
}

/**
 * The ticks on the Senior tile in Role access (Phil, 2026-09-29: "in the Senior tile have the
 * boxes, People / Service users"). Their own area is not a tick: a Senior is a carer and keeps it.
 */
export const SENIOR_TILE_MODULES = ["people", "service_users"] as const;

/** The departments a role's tile in Role access shows and saves: all of them, except a Senior's. */
export function tileModulesFor(role: string, all: readonly string[]): string[] {
  return role === "senior" ? all.filter((k) => (SENIOR_TILE_MODULES as readonly string[]).includes(k)) : [...all];
}

/**
 * Where a Senior is sent when they open anything under People or Service Users other than their
 * list, or the Complete page of a Check (0339: the Checks ticked on their tile they may complete).
 * A record, a summary or a new record form is not theirs, and RLS would refuse it anyway. Whether
 * a Complete page is theirs is the database's question (senior_may_do_instance), asked by the page.
 * Null means the path is fine as it is.
 */
const SENIOR_COMPLETE_PATH = /^\/(people|service-users)\/[0-9a-f-]{36}\/checks\/[0-9a-f-]{36}\/complete\/?$/i;

export function seniorPathRedirect(pathname: string): string | null {
  if (SENIOR_COMPLETE_PATH.test(pathname)) return null;
  for (const root of ["/people", "/service-users"]) {
    if (pathname.startsWith(`${root}/`)) return root;
  }
  return null;
}

/** Where a Senior lands after completing a Check: their list, with the outcome to show. */
export function seniorListAfter(
  population: "people" | "service_users",
  outcome: "completed" | "recorded" | "history",
  checkName: string,
): string {
  const root = population === "people" ? "/people" : "/service-users";
  return `${root}?${outcome}=${encodeURIComponent(checkName)}`;
}
