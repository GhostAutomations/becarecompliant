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
