/**
 * Be Care Compliant — who can be somebody's LINE MANAGER, and who is company wide.
 *
 * PURE, with no runtime imports, so both screens that ask the question share one answer.
 *
 * WHY IT EXISTS (Phil, 2026-08-19). Two screens disagreed about it:
 *   * Add a person filtered the list to `manager` and `company_admin`, so a **Registered
 *     Manager** — who in most agencies runs the lot — could not be chosen as anybody's manager.
 *   * The Edit form on the record offered EVERY supervisory user, so the **Responsible
 *     Individual** could be set as a carer's line manager. Phil: the RI is a passive,
 *     see-everything role; nobody reports into them.
 *
 * So one carer could have a line manager the other screen would never have offered. That is the
 * "two screens quoting the same number" trap, and it is why this lives in one file with tests.
 */

/** Roles whose reach is the whole company, so a branch means nothing for their access.
 *  Mirrors is_company_wide in the database (see lib/auth/manage-scope.ts). */
export const COMPANY_WIDE_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
] as const;

export function isCompanyWideRole(role: string): boolean {
  return (COMPANY_WIDE_ROLES as readonly string[]).includes(role);
}

/**
 * Roles that are not asked for a branch when they are invited.
 *
 * NOT the same list as COMPANY_WIDE_ROLES, and the difference is Phil's (2026-08-19):
 * **a Registered Manager may well run one branch, not all of them** — CIW registers a manager
 * against a service, and plenty of providers have one RM per registered service. So an RM picks
 * a branch like anybody else, and that branch is their base.
 *
 * The Responsible Individual does not, because they oversee the whole provider and nobody
 * reports into them; nor does a Company Admin.
 *
 * NOTE, and it matters: the DATABASE still treats a Registered Manager as company wide
 * (is_company_wide), so the branch recorded here is their base, not a limit on what they can
 * reach. Narrowing that is a permissions change, not a form change.
 */
export const NO_BRANCH_ROLES = ["company_admin", "registered_individual"] as const;

export function picksABranch(role: string): boolean {
  return !(NO_BRANCH_ROLES as readonly string[]).includes(role);
}

/** The value the branch picker posts for "All branches". Not an empty string: empty is what an
 *  untouched required select posts, and "they chose all branches" must not be indistinguishable
 *  from "they chose nothing". */
export const ALL_BRANCHES = "all";

/**
 * Who may be offered "All branches" as a CHOICE on the invite form: **everybody who picks a
 * branch at all** (Phil, 2026-08-19, after asking for it for the Registered Manager first and
 * then for every role). It is never the default — the picker still opens on "Choose a branch".
 *
 * What it MEANS depends on the role, and the difference is not cosmetic:
 *   * For a company wide role (Registered Manager) nothing is written — they already reach
 *     every branch through is_company_wide.
 *   * For a scoped role (Branch Manager, Supervisor, On Call, Viewer) it writes a
 *     `user_branches` row for EVERY active branch, because for them reach comes from those rows.
 *     That is the same thing the Users screen calls "additional branches", done up front.
 */
export function mayChooseAllBranches(role: string): boolean {
  return picksABranch(role);
}

/**
 * Roles that may be chosen as a person's line manager.
 *
 * Registered Manager IS here: they manage, often across every branch.
 * Responsible Individual is NOT: they oversee and can see everything, but nobody reports into
 * them, and a supervision chain that runs to the RI misrepresents who is accountable.
 * Supervisor is NOT: supervisors are assigned separately, further down the same form.
 */
export const LINE_MANAGER_ROLES = ["company_admin", "registered_manager", "manager"] as const;

export function canBeLineManager(role: string): boolean {
  return (LINE_MANAGER_ROLES as readonly string[]).includes(role);
}
