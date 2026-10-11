/**
 * Be Care Compliant - WHICH ROLES GET AN EMAIL. Pure, and deliberately IMPORTLESS,
 * so it runs under `node --experimental-strip-types --test`.
 *
 * Split out of lib/notifications/data.ts and lib/notifications/holiday.ts for the
 * reason written at the top of scope.ts: the Supervisor digest was empty for a
 * month because the rule that decided it lived inside a file that imports the
 * Supabase admin client, which no test can load. Both rules below have been
 * wrong at least once and both were defended only by a comment.
 *
 * THE ROLE LIST IS ELEVEN LONG (profiles_role_check, the Founder included), and two of
 * them are easy to forget because they arrived after everything else was written:
 * registered_individual (Responsible Individual) and registered_manager
 * (Registered Manager). Both are COMPANY WIDE, exactly like a Company Admin.
 * They received no digest, no chaser and no holiday email at all until
 * 2026-07-27, because every downstream check asked `role === "company_admin"`.
 */

/** Every role that is a compliance email recipient at all. Team Member, Viewer,
 *  On Call and the founder are not: the first three have no oversight duty and
 *  the founder has no company. */
export const COMPLIANCE_RECIPIENT_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

/** Who may decide a holiday request, and so who is told one is waiting. A
 *  Supervisor or Recruiter may book a holiday but not approve one, so they are not
 *  here (Phil, 11 Oct 2026, audit F7; can_approve_holiday in the database). */
export const HOLIDAY_APPROVER_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

/**
 * May this role approve, decline, edit the dates of or cancel a holiday in the office?
 * The approver roles plus the Founder, who has no company and so is never emailed (support
 * mode carries company_admin anyway). A Branch Manager's answer is still only for their own
 * branches, and nobody decides their own holiday: the database holds both of those
 * (can_approve_holiday, decide_holiday_request), this only decides what the screen offers.
 */
export function isHolidayApprover(role: string): boolean {
  return HOLIDAY_APPROVER_ROLES.includes(role) || role === "platform_admin";
}

/**
 * Who can be an SMS escalation recipient, and so who the Settings > Notifications
 * list offers. It must be exactly the roles the cron escalates to, which filters
 * on the NORMALISED role being company_admin or manager: a Supervisor gets the
 * daily digest but is never texted. The test below holds the two together, so
 * the screen cannot offer somebody the cron will never text.
 */
export const SMS_ESCALATION_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

/**
 * The roles whose authority is the whole company rather than a branch. NOT
 * exported: lib/nav.ts already exports a COMPANY_WIDE_ROLES of its own, and two
 * arrays of the same name in the same editor is how the wrong one gets imported.
 * Ask isCompanyWideRole instead.
 */
const COMPANY_WIDE_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
];

export function isCompanyWideRole(role: string): boolean {
  return COMPANY_WIDE_ROLES.includes(role);
}

/**
 * The role every downstream scoping rule should see.
 *
 * Returns null for a role that is not a compliance recipient, so a caller that
 * forgets to filter first still cannot email a Viewer. The two Registered roles
 * collapse to company_admin, which is what scopeItems, overdueForRecipient and
 * scopeInvoicingRows all already understand.
 */
export function normaliseRecipientRole(
  role: string,
): "company_admin" | "manager" | "supervisor" | null {
  if (isCompanyWideRole(role)) return "company_admin";
  if (role === "manager") return "manager";
  if (role === "supervisor") return "supervisor";
  return null;
}

/**
 * Who is emailed that a holiday request is waiting.
 *
 * A Branch Manager's authority is their branch, so they are told about their own
 * branch's requests and nothing else. A request with NO branch belongs to no
 * branch: after migration 0206 a Branch Manager can neither see it on the
 * Holiday page nor decide it, so emailing them one is worse than silence. The
 * company wide roles are always told, branch or no branch.
 *
 * `managerIdsInBranch` is the set of manager profile ids with a user_branches
 * row for this request's branch. Passing an empty set when the branch has no
 * managers is correct and leaves only the company wide roles.
 *
 * `ownerId` is the login whose holiday it is (holiday_request_owner). Nobody
 * decides their own holiday (audit F7, Phil 11 Oct 2026), so they are never
 * asked to: an approver's own request goes to the other approvers only.
 */
export function holidayApprovers<T extends { id: string; role: string }>(opts: {
  branchId: string | null;
  candidates: T[];
  managerIdsInBranch: string[];
  ownerId?: string | null;
}): T[] {
  const inBranch = new Set(opts.managerIdsInBranch);
  return opts.candidates.filter((c) => {
    if (opts.ownerId && c.id === opts.ownerId) return false;
    if (isCompanyWideRole(c.role)) return true;
    if (c.role !== "manager") return false;
    return opts.branchId !== null && inBranch.has(c.id);
  });
}
