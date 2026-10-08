/**
 * Who may hold an absence meeting (and so be named to hear an appeal).
 *
 * Managers and above always (Phil, 2026-07-12). Supervisors since 2026-10-08 (Phil, for Thistle),
 * unless their company has unticked Absence for Supervisors in Settings > Role access. Pure, so
 * node --test can load it.
 */

export const MEETING_CONDUCTOR_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

/** The roles whose right to hold a meeting depends on their Absence tick. */
const TICK_DEPENDENT = new Set(["supervisor"]);

/** `disabled` is the company's switched off `role|module` pairs (disabledModules). */
export function mayHoldMeeting(role: string | null | undefined, disabled: ReadonlySet<string>): boolean {
  const r = role ?? "";
  if (!MEETING_CONDUCTOR_ROLES.includes(r)) return false;
  return !TICK_DEPENDENT.has(r) || !disabled.has(`${r}|absence`);
}
