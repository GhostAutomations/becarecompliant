/**
 * Who may hold a Return to Work interview.
 *
 * NOT ON CALL (Phil, 2026-10-11, popup, audit step 7). On Call records absences and absence
 * meetings in every branch (on-call.md), but a Return to Work is held by the branch, and the
 * database never let On Call close one: the Evidence was stored and then the absence update was
 * refused. Since 0444 the Return to Work form itself is refused for On Call before anything is
 * stored (may_file_evidence). So the Return to Work card, with its Record button, its AI draft and
 * the text to the employee, is not offered to On Call, and the three actions say no first.
 *
 * The same office roles the Absence page offers, less On Call. Pure, so node --test can load it.
 */

export const RTW_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
];

export const RTW_ROLE_REFUSAL =
  "Return to Work interviews are recorded by the branch office, so your role cannot record one.";

export function canRecordReturnToWork(role: string | null | undefined): boolean {
  return RTW_ROLES.includes(role ?? "");
}
