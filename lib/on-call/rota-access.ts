/**
 * Be Care Compliant: who opens On Call, and who sets its rota (Phil, 2026-10-13, popups;
 * docs/decisions/on-call.md, migration 0450).
 *
 * ONE LIST. The On Call pages, the server actions, the export and the menu each kept their own copy
 * of the roles, which is how a Recruiter came to be offered On Call in Settings and refused it by
 * every page. They all read ON_CALL_ROLES now.
 *
 * WHO SETS THE ROTA. The database decides (can_set_on_call_shift, 0450); this mirrors it so the
 * screen offers exactly what will save:
 *   Admins, the Registered roles, On Call and the Founder: always, any branch or the company rota.
 *   A Manager: her own branch(es), or the company wide rota.
 *   A Supervisor: her own branch(es), or the company wide rota, when her company has her role
 *   ticked "On Call: can set the rota" in Settings, Role access. A Recruiter likewise, for every
 *   branch.
 * Seniors, Viewers and carers never open On Call.
 *
 * Pure and importless, so node --test can load it.
 */

/** Every role that opens On Call (the rota and the Handover). */
export const ON_CALL_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  // A Recruiter is a Supervisor for the whole company (0310), and opens On Call as one (0450).
  "recruiter",
  "on_call",
];

/** Roles that see every branch's rota and Handover rather than their own branches. */
export const ALL_BRANCH_ON_CALL_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "on_call",
  "recruiter",
];

/** The roles a company can switch rota setting off for, on their Role access tiles. */
export const ROTA_SWITCH_ROLES: readonly string[] = ["supervisor", "recruiter"];

/** Rota setting that no company switch can take away. */
const ALWAYS_SETS_ROTA: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "on_call",
  "manager",
];

/**
 * Whether this person may add, change and remove shifts on the rota they are looking at.
 * `hasBranch` is whether a branch rota has a branch of theirs selected; branch reach itself
 * (which branches are theirs) is decided by the branch list and the database.
 */
export function canSetRota(i: {
  role: string;
  scope: "branch" | "company";
  hasBranch: boolean;
  /** The company's on_call_rota_roles: which of Supervisor and Recruiter are ticked. */
  rotaRoles: readonly string[] | null;
}): boolean {
  if (i.scope === "branch" && !i.hasBranch) return false;
  if (ALWAYS_SETS_ROTA.includes(i.role)) return true;
  if (ROTA_SWITCH_ROLES.includes(i.role)) return (i.rotaRoles ?? ROTA_SWITCH_ROLES).includes(i.role);
  return false;
}
