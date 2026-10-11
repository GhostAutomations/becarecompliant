/**
 * Who opens Inspection Readiness, and so who stores and reads its daily scores.
 *
 * The readiness page and captureReadinessSnapshot share this list so the two can never
 * disagree. Readiness is a management screen (MANAGEMENT in lib/auth/module-catalogue.ts):
 * the Founder, Company Admin, the Registered roles and Branch Managers. The database says the
 * same (framework_readiness_snapshots policies, 0444, audit F53, Phil 11 Oct 2026): those roles
 * store today's scores, a Branch Manager only for their own branches and never the company wide
 * row, and a stored score is changed or deleted by the Founder only.
 *
 * Pure and importless so it can be unit tested.
 */

export const READINESS_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

/**
 * May this login store today's scores for this view? A Branch Manager's scores are worked out
 * from their own branches only, so they never stand in for the company wide row (branch null).
 */
export function maySnapshotReadiness(role: string, branchId: string | null): boolean {
  if (!READINESS_ROLES.includes(role)) return false;
  if (role === "manager" && !branchId) return false;
  return true;
}
