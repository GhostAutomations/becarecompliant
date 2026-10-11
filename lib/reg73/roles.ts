/**
 * Be Care Compliant — who sees and who edits the Regulation 73 and Regulation 80 reports.
 *
 * One list for both reports, shared by the six pages, the two PDF routes and the actions, so
 * they can never drift apart. Decided by Phil, 11 Oct 2026 (popup, audit F16 and F52): Company
 * Admin, Responsible Individual and Registered Manager see and edit every branch's; a Branch
 * Manager views only their own branches'; nobody else sees them. The database read rule
 * (reg73_visits_select, reg80_reviews_select, 0444) is what limits a Branch Manager to their
 * own branches, so another branch's report is simply not found for them.
 *
 * platform_admin is listed for the Founder; in support mode the guard shadows his role to
 * company_admin, which is in both lists anyway.
 *
 * Pure and importless so it can be unit tested.
 */

export const REG_REPORT_VIEW_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

export const REG_REPORT_EDIT_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
];

export function canViewRegReport(role: string): boolean {
  return REG_REPORT_VIEW_ROLES.includes(role);
}

/** Start, edit, sign, refresh, AI draft and delete. A Branch Manager only views. */
export function canEditRegReport(role: string): boolean {
  return REG_REPORT_EDIT_ROLES.includes(role);
}

/** The PDF routes' refusal, for a login that may not see these reports. */
export const REG_REPORT_REFUSED =
  "Only Admins, the Responsible Individual, the Registered Manager and Branch Managers can open this report.";
