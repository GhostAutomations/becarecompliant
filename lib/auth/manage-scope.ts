/**
 * Be Care Compliant - CAN THIS PERSON MANAGE THIS RECORD. Pure, and deliberately IMPORTLESS.
 *
 * WHY IT EXISTS (Phil, 2026-08-14). Every "can I edit this" decision in the app was a ROLE
 * check: `MANAGE_ROLES.includes(profile.role)`. RLS, which actually decides, is a role check
 * AND a branch check. So the screen and the database disagreed, and the screen was the
 * optimistic one: a manager was shown Add, Edit, Manage record and Archive on a record the
 * database would refuse to let her touch. She presses the button, the write is refused, and the
 * app has told her she may do something it will not let her do.
 *
 * THE CASE THAT MADE IT REAL. Migration 0183 let a booked conductor see the person they are
 * booked with, which is right: a manager conducting a supervision on a carer from another
 * branch has to be able to open the record. But `people_select` now reaches further than
 * `people_update` does, and the role check could not tell the difference. Tim Mingle manages
 * Cardiff1 and Newport1, and a booking was deliberately left for a carer in Caerphilly.
 *
 * THIS FUNCTION IS A TRANSCRIPTION OF THE RLS POLICY, and nothing more:
 *
 *   people_update USING/WITH CHECK =
 *     is_platform_admin() OR is_company_admin(company_id) OR is_branch_manager(branch_id)
 *
 *   is_branch_manager(bid) =
 *     (role 'manager' AND active AND bid IN user_branches)
 *     OR is_company_wide(company of bid)      -- company_admin, registered_individual,
 *     OR is_platform_admin()                     registered_manager
 *
 * Keep the two in step. If a policy changes, this changes in the same commit, and the test file
 * next to it is where you say why.
 */

/** Roles whose reach is the whole company, so no branch check applies. Mirrors is_company_wide
 *  plus platform_admin, which the policies always OR in separately. */
const COMPANY_WIDE = new Set([
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
]);

/**
 * Can this caller WRITE to a record sitting in this branch?
 *
 * A null recordBranchId is refused for a Manager, on purpose. A record with no branch is
 * unreachable through `is_branch_manager`, which needs a branch to match, so showing her a
 * button would repeat exactly the lie this function exists to stop.
 */
export function canManageRecord(opts: {
  role: string;
  /** The branches this caller is assigned to, from user_branches. Empty for a company wide role. */
  branchIds: string[];
  /** The branch the record sits in. */
  recordBranchId: string | null | undefined;
}): boolean {
  if (COMPANY_WIDE.has(opts.role)) return true;
  if (opts.role !== "manager") return false;
  return !!opts.recordBranchId && opts.branchIds.includes(opts.recordBranchId);
}

/**
 * Could this role manage ANYTHING, ignoring which record?
 *
 * For the coarse decisions only: whether a page redirects, whether a toolbar button exists at
 * all. NEVER for a control attached to one record; that is what canManageRecord is for, and
 * using this instead is the defect.
 */
export function canManageAnything(role: string): boolean {
  return COMPANY_WIDE.has(role) || role === "manager";
}

/**
 * Does this role reach the whole company, whatever user_branches says?
 *
 * The same set the RLS `is_company_wide` uses. Exported because three screens were each
 * deciding it for themselves with an inline `role === "company_admin"`, which is right
 * for the Admin and wrong for the other two.
 */
export function isCompanyWideRole(role: string): boolean {
  return COMPANY_WIDE.has(role);
}

/**
 * WHAT THE SCREEN SHOULD SAY ABOUT SOMEBODY'S BRANCHES.
 *
 * WHY IT EXISTS (Phil, 2026-09-04, looking at Settings > Users). Every one of six pending
 * invites read "no branch". Four of them were invited with All branches and hold a
 * user_branches row for every branch in the company; the other two are company wide roles
 * that reach everything without a row at all. The screen was reporting the exact opposite
 * of the truth, on the screen an Admin uses to decide whether the team is set up.
 *
 * Two separate bugs, one rule missing:
 *   * Pending invites printed the invite's single branch_id, which is null for an
 *     All branches invite, so "all" and "none" looked identical.
 *   * The team list said "All branches" for company_admin only, so a Responsible
 *     Individual and a Registered Manager - both company wide in the policy - read
 *     "No branch" while seeing everything.
 *
 * Same failure as canManageRecord above, in the other direction: there the screen was
 * optimistic about what the database would allow, here it is pessimistic. Both are the
 * screen and the database disagreeing.
 */
export function branchSummary(opts: {
  role: string;
  /** Branch names from this person's user_branches rows. */
  branchNames: readonly string[];
  /** How many active branches the company has, to recognise "all of them". */
  activeBranchCount: number;
}): string {
  if (isCompanyWideRole(opts.role)) return "All branches";
  if (opts.branchNames.length === 0) return "No branch";
  if (opts.activeBranchCount > 0 && opts.branchNames.length >= opts.activeBranchCount) {
    return "All branches";
  }
  return [...opts.branchNames].join(", ");
}

/**
 * Is this role confined to the branches it is assigned to?
 *
 * WHY IT EXISTS (Phil, 2026-08-14). `branches_select` is `is_company_member`, so every branch in
 * the company is READABLE by anyone in it, and every branch picker in the app rendered whatever
 * it was handed. A manager of Cardiff1 and Newport1 could therefore choose Caerphilly from the
 * Branch dropdown and be told "No active people in this branch yet. Add people to the register",
 * which is false and points her at the wrong action.
 *
 * The register filter was the visible half. The worse half was the branch picker on a RECORD:
 * `people_insert` and `people_update` both require `is_branch_manager(branch_id)`, so choosing a
 * branch she does not run meant filling in a whole form that the database would refuse at the
 * end. Same defect as a Manage button that cannot save, which is what canManageRecord above was
 * written for.
 *
 * MANAGER and SUPERVISOR only, and deliberately no one else. Both are provably branch confined
 * in the database: `is_branch_manager` joins user_branches, and `is_person_supervisor` has done
 * the same since 0078. An On Call user reads the WHOLE company (`is_company_on_call`), so
 * narrowing them would take away branches they can genuinely reach, and the company wide roles
 * are unaffected by definition. Widening this set is a decision about RLS, not about a dropdown.
 */
export function branchScopedRole(role: string): boolean {
  return role === "manager" || role === "supervisor";
}

/**
 * May this caller put THEMSELVES down as the conductor of a task in this branch?
 *
 * Not "may they book" — Phil, 2026-08-15: people book tasks for each other, so anybody who can
 * use the Planner can book anybody in the company. The restriction is narrower than a branch and
 * sits on the CONDUCTOR, because being the conductor of a live booking is what grants sight of
 * that one carer's record (0183). What must not happen is somebody granting that to themselves.
 *
 * A THIRD RULE, because it is a third policy. `planner_bookings_insert` is:
 *
 *   is_platform_admin() OR is_company_admin(company_id)
 *   OR is_branch_manager(branch_id) OR is_branch_supervisor(branch_id)
 *
 * Note the supervisor clause. A Supervisor may conduct in their own branch, and canManageRecord
 * refuses them, so reusing that here would hide a choice the database would have allowed.
 */
export function mayConductInBranch(opts: {
  role: string;
  branchIds: string[];
  recordBranchId: string | null | undefined;
}): boolean {
  if (COMPANY_WIDE.has(opts.role)) return true;
  if (!branchScopedRole(opts.role)) return false;
  return !!opts.recordBranchId && opts.branchIds.includes(opts.recordBranchId);
}
