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
