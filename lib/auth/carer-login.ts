/**
 * Carer logins: the two roles whose home is their own area (My area) rather than the office
 * product (Phil, 2026-09-29).
 *
 *   staff   "Team Member": a carer's own login, and only their own area.
 *   senior  "Senior": a carer's own login PLUS a list of names, People and or Service Users
 *           from their own branches, as ticked on the Senior tile in Role access. Names only:
 *           no records, checks, dates or contact details. The names come from the database
 *           function senior_name_list, never from the people or service_users tables, which a
 *           Senior reads exactly as a carer does (their own record only).
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
 * Where a Senior is sent when they open anything under People or Service Users other than the
 * list itself: back to the list. Their names page is the only page in either department they
 * have; a record, a summary or a new record form is not theirs, and RLS would refuse it anyway.
 * Null means the path is fine as it is.
 */
export function seniorPathRedirect(pathname: string): string | null {
  for (const root of ["/people", "/service-users"]) {
    if (pathname.startsWith(`${root}/`)) return root;
  }
  return null;
}
