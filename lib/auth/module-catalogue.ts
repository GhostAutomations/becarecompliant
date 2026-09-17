/**
 * Be Care Compliant — every department, and the most any role could ever see of it.
 *
 * Pure and deliberately IMPORTLESS, so node --test can load it: this decides who reaches
 * safeguarding records, and it should not be a module that can only be checked on screen.
 *
 * WHY IT EXISTS (Phil, 2026-09-17): "Maybe in settings we need user access and select what each
 * role sees. What a role is added, that role gets a tiles with call departments / views, if they
 * are ticked, that role gets access to it."
 *
 * Adding one role to two departments this morning meant editing the same array in THIRTEEN files
 * — five Complaints pages, four Incidents pages, two action modules and two nav entries — all of
 * which had to agree with each other and with RLS. Three times today a role was let past two
 * gates of three and shown a blank page. One list cannot disagree with itself.
 *
 * THE CEILING, AND WHY IT IS IN CODE RATHER THAN IN THE DATABASE. `roles` here is the most a role
 * could EVER have, not what it has today. A company's own settings may switch a department OFF
 * for a role, never on beyond this list. That is what keeps the setting honest without rewriting
 * RLS: the policies stay the backstop, the ticks narrow beneath them, and the worst a mis-click
 * can do is hide a page. A tick that could GRANT would need every policy to stop naming roles and
 * start reading a table, which is the security model rewritten and a different job.
 *
 * WHAT THIS IS NOT. It decides which DEPARTMENTS a role opens. WHICH RECORDS they then see is
 * branch scoping, and that stays in RLS: a Supervisor ticked into Complaints still sees only her
 * own branches.
 */

export type ModuleKey =
  | "dashboard"
  | "people"
  | "training"
  | "holiday"
  | "absence"
  | "service_users"
  | "complaints"
  | "incidents"
  | "whistleblowing"
  | "briefings"
  | "on_call"
  | "planner"
  | "invoicing"
  | "readiness"
  | "reports"
  | "settings"
  | "team_portal";

export type ModuleDef = {
  key: ModuleKey;
  /** What it is called on the tile, matching the nav. */
  label: string;
  /** The most any of these roles could have. A company narrows within it, never past it. */
  roles: readonly string[];
  /** Said on the tile beside a greyed tick, so the screen teaches rather than ignores. */
  note?: string;
};

/** Every role that is not a Viewer or a carer's own login. The common ceiling. */
const OFFICE = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
] as const;

/** Company wide roles plus Branch Managers: the people who run a branch or the company. */
const MANAGEMENT = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
] as const;

const ADMIN_ONLY = ["platform_admin", "company_admin"] as const;

export const MODULES: readonly ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", roles: OFFICE },
  {
    key: "people",
    label: "People",
    roles: [...OFFICE, "team_member"],
    note: "A Viewer can see the register read only.",
  },
  { key: "training", label: "Training", roles: [...OFFICE, "team_member"] },
  { key: "holiday", label: "Holiday", roles: OFFICE },
  { key: "absence", label: "Absence", roles: [...OFFICE, "on_call"] },
  {
    key: "service_users",
    label: "Service Users",
    roles: [...OFFICE, "team_member"],
    note: "A Viewer can see the register read only.",
  },
  {
    key: "complaints",
    label: "Complaints",
    roles: [...OFFICE, "on_call"],
    note: "On Call takes complaints out of hours.",
  },
  {
    key: "incidents",
    label: "Incidents",
    roles: OFFICE,
    note: "Not On Call: an out of hours caller records the call in the Handover, and an incident is written up by the branch with the notifiable and safeguarding decisions on it.",
  },
  { key: "whistleblowing", label: "Whistleblowing", roles: MANAGEMENT },
  { key: "briefings", label: "Briefings", roles: OFFICE },
  { key: "on_call", label: "On Call", roles: [...OFFICE, "on_call"] },
  { key: "planner", label: "Planner", roles: OFFICE },
  {
    key: "invoicing",
    label: "Invoicing",
    roles: MANAGEMENT,
    note: "Money. Never a Supervisor or a Viewer.",
  },
  { key: "readiness", label: "Readiness", roles: MANAGEMENT },
  { key: "reports", label: "Reports", roles: MANAGEMENT },
  {
    key: "settings",
    label: "Settings",
    roles: ADMIN_ONLY,
    note: "Fixed. An Admin who could switch off their own Settings would have no way back in.",
  },
  /*
   * THE TEAM PORTAL (Phil, 2026-09-17: "need the team portal on the access settings as well").
   *
   * A carer's own area: their training, their checks, raising a concern. `staff` is the only role
   * that has it, and it is the only thing `staff` has, which is exactly why it belongs here. A
   * company that is not ready to hand carers a login of their own switches it off in one tick
   * instead of leaving the logins created and pointing at a page they were not meant to see yet.
   *
   * Switching it off leaves a carer with nowhere to go, and that is the honest outcome rather
   * than a bug: their login exists and their company has closed the door. The page that says so
   * names the role and who can reopen it.
   */
  {
    key: "team_portal",
    label: "Team Portal",
    roles: ["staff"],
    note: "A carer's own area, and the only thing a Team Member login opens.",
  },
];

const BY_KEY = new Map<string, ModuleDef>(MODULES.map((m) => [m.key, m]));

export function moduleDef(key: string): ModuleDef | null {
  return BY_KEY.get(key) ?? null;
}

/** Could this role EVER have this department, whatever a company has ticked? */
export function withinCeiling(key: string, role: string): boolean {
  const def = BY_KEY.get(key);
  return !!def && def.roles.includes(role);
}

/**
 * Departments a company CANNOT switch off, whoever asks.
 *
 * Settings, for the Admin who owns the screen: the first person to untick their own Settings
 * would lock the company out of every setting including this one, and getting back in would be a
 * support request to us with a SQL console.
 */
export function isLocked(key: string, role: string): boolean {
  return key === "settings" && (role === "company_admin" || role === "platform_admin");
}

/**
 * THE ONE QUESTION: may this role open this department in this company?
 *
 * `disabled` is the set of `role|module` pairs a company has switched off. ABSENCE MEANS ON, on
 * purpose: a department added to the product later is available to every role inside its ceiling
 * from the day it ships, rather than silently off for every existing company until somebody
 * notices. Only a deliberate switching off is ever stored.
 */
export function canUseModule(
  key: string,
  role: string,
  disabled: ReadonlySet<string> = new Set(),
): boolean {
  if (!withinCeiling(key, role)) return false;
  if (isLocked(key, role)) return true;
  return !disabled.has(`${role}|${key}`);
}

/** The key used in `disabled`, so nobody builds the string by hand in two shapes. */
export function disabledKey(role: string, key: string): string {
  return `${role}|${key}`;
}
