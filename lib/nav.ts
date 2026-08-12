import { PUBLIC_FORMS_ENABLED } from "@/lib/public-forms/flag";

export type Role =
  | "platform_admin"
  | "company_admin"
  | "registered_individual"
  | "registered_manager"
  | "manager"
  | "supervisor"
  | "team_member"
  | "on_call"
  | "staff";

/** Senior roles that see every branch and everything a Branch Manager can, but not
 *  Settings or Billing (Company Admin only). Kept in one place so app-side gating
 *  matches the is_company_wide() RLS helper. */
export const COMPANY_WIDE_ROLES: Role[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
];

export type NavEntry = {
  href: string;
  label: string;
  icon:
    | "dashboard"
    | "people"
    | "serviceUsers"
    | "complaints"
    | "incidents"
    | "whistleblowing"
    | "invoicing"
    | "settings"
    | "founder"
    | "holiday"
    | "absence"
    | "submissions"
    | "briefings"
    | "training"
    | "compliance"
    | "outcomes"
    | "satisfaction"
    | "planner"
    | "whiteboard"
    | "onCall"
    | "readiness"
    | "reports";
  /** Roles allowed to see this entry. Undefined means everyone. */
  roles?: Role[];
  /** Optional sidebar section heading shown above this entry (e.g. "Departments"). */
  group?: string;
  /** Nested sub-sections ("Sub Departments") shown indented under this entry. */
  children?: NavEntry[];
  /** Extra regex path patterns (as strings, so they serialise to the client) that
   *  also mark this entry active, e.g. a per-record page under a different path. */
  activeMatch?: string[];
};

/** Everyone except a Viewer (read-only, People + Service Users only). */
const NOT_VIEWER: Role[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

export const NAV_ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: NOT_VIEWER },
  {
    href: "/people",
    label: "People",
    icon: "people",
    group: "Departments",
    children: [
      { href: "/people", label: "Compliance", icon: "compliance" },
      {
        href: "/people/training",
        label: "Training",
        icon: "training",
        roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
      },
      { href: "/people/holiday", label: "Holiday", icon: "holiday", roles: NOT_VIEWER },
      {
        href: "/people/absence",
        label: "Absence",
        icon: "absence",
        roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "on_call"],
      },
      // Public form submissions queue. Hidden while PUBLIC_FORMS_ENABLED is false
      // (lib/public-forms/flag.ts): nothing arrives, so it would be a dead link.
      ...(PUBLIC_FORMS_ENABLED
        ? [
            {
              href: "/people/submissions",
              label: "Submissions",
              icon: "submissions" as const,
              roles: [
                "platform_admin", "company_admin", "registered_individual",
                "registered_manager", "manager",
              ] as Role[],
            },
          ]
        : []),
    ],
  },
  {
    href: "/service-users",
    label: "Service Users",
    icon: "serviceUsers",
    group: "Departments",
    children: [
      { href: "/service-users", label: "Compliance", icon: "compliance" },
      {
        href: "/service-users/outcomes",
        label: "Outcomes",
        icon: "outcomes",
        roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
        // Also light up on a single service user's Personal outcomes page.
        activeMatch: ["^/service-users/[^/]+/outcomes$"],
      },
      {
        href: "/service-users/satisfaction",
        label: "Satisfaction",
        icon: "satisfaction",
        roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
      },
    ],
  },
  {
    href: "/complaints",
    label: "Complaints",
    icon: "complaints",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager", "on_call"],
    children: [
      { href: "/complaints", label: "Open", icon: "complaints" },
      { href: "/complaints/closed", label: "Closed", icon: "complaints" },
    ],
  },
  {
    href: "/incidents",
    label: "Incidents",
    icon: "incidents",
    group: "Departments",
    // No On Call: an out of hours caller records the call in the Call log. An incident
    // is written up by the branch, with the notifiable and safeguarding decisions on it.
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
    children: [
      { href: "/incidents", label: "Open", icon: "incidents" },
      { href: "/incidents/closed", label: "Closed", icon: "incidents" },
    ],
  },
  {
    href: "/whistleblowing",
    label: "Whistleblowing",
    icon: "whistleblowing",
    group: "Departments",
    // Company Admin and Responsible Individual ONLY. Hiding the entry is a courtesy, not
    // the control: whistleblowing_disclosures refuses everyone else in RLS (0174/0175),
    // because the commonest real disclosure is about a manager.
    roles: ["company_admin", "registered_individual"],
  },
  {
    href: "/briefings",
    label: "Briefings",
    icon: "briefings",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
  },
  {
    href: "/on-call",
    label: "On Call",
    icon: "onCall",
    group: "Departments",
    roles: [
      "platform_admin", "company_admin", "registered_individual",
      "registered_manager", "manager", "supervisor", "on_call",
    ],
    activeMatch: ["^/on-call"],
    children: [
      { href: "/on-call", label: "Rota", icon: "onCall" },
      { href: "/on-call/log", label: "Call log", icon: "onCall" },
    ],
  },
  {
    href: "/planner",
    label: "Planner",
    icon: "planner",
    group: "Departments",
    roles: NOT_VIEWER,
    // Light up the parent on a single conductor's planner and the whiteboard.
    activeMatch: ["^/planner"],
    children: [
      { href: "/planner", label: "My Planner", icon: "planner" },
      { href: "/planner/whiteboard", label: "Whiteboard", icon: "whiteboard" },
    ],
  },
  {
    href: "/invoicing",
    label: "Invoicing",
    icon: "invoicing",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
    children: [
      { href: "/invoicing", label: "Invoices", icon: "invoicing" },
      { href: "/invoicing/schedules", label: "Recurring", icon: "planner" },
      { href: "/invoicing/clients", label: "Private Clients", icon: "people" },
    ],
  },
  {
    href: "/readiness",
    label: "Readiness",
    icon: "readiness",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "reports",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
    group: "Departments",
    roles: ["company_admin"],
  },
  { href: "/founder", label: "Founder", icon: "founder", roles: ["platform_admin"] },
];

/** Nav entries (and their children) visible to a given role. */
export function navEntriesForRole(role: string): NavEntry[] {
  // The founder (platform admin) has no company context of their own: their home
  // is the Founder console. The care sections (Dashboard, People, Service Users,
  // Reports) are reached only by entering a company via Manage as company, at
  // which point the layout renders the company_admin nav instead.
  if (role === "platform_admin") {
    return NAV_ENTRIES.filter((entry) => entry.href === "/founder");
  }
  // The On Call role is a focused out-of-hours role: its ONLY departments are On
  // Call, Absence and Complaints (all branches). A flat, bespoke nav avoids
  // showing the People parent (whose /people compliance page it cannot access).
  if (role === "on_call") {
    return [
      {
        href: "/on-call",
        label: "On Call",
        icon: "onCall",
        group: "Departments",
        activeMatch: ["^/on-call"],
        children: [
          { href: "/on-call", label: "Rota", icon: "onCall" },
          { href: "/on-call/log", label: "Call log", icon: "onCall" },
        ],
      },
      { href: "/people/absence", label: "Absence", icon: "absence", group: "Departments" },
      {
        href: "/complaints",
        label: "Complaints",
        icon: "complaints",
        group: "Departments",
        children: [
          { href: "/complaints", label: "Open", icon: "complaints" },
          { href: "/complaints/closed", label: "Closed", icon: "complaints" },
        ],
      },
    ];
  }
  // A Team Member (staff) login has exactly one destination: their own area.
  // Everything else is closed to them by RLS as well as by this nav.
  if (role === "staff") {
    return [{ href: "/my", label: "My area", icon: "people" as const, group: "Departments" }];
  }
  const allowed = (entry: NavEntry) =>
    !entry.roles || entry.roles.includes(role as Role);
  return NAV_ENTRIES.filter(allowed).map((entry) =>
    entry.children
      ? { ...entry, children: entry.children.filter(allowed) }
      : entry,
  );
}

export const ROLE_LABELS: Record<string, string> = {
  // NOTE the two names that read alike, on purpose. 'team_member' is the OLD
  // read-only role, shown as "Viewer" since the roles overhaul. 'staff' is the
  // NEW self-service role for carers, shown as "Team Member", which is what Phil
  // calls them. Renaming the old key would mean rewriting five live RLS policies
  // including people_select, which is not worth it for a label.
  platform_admin: "Founder",
  company_admin: "Admin",
  registered_individual: "Responsible Individual",
  registered_manager: "Registered Manager",
  manager: "Branch Manager",
  supervisor: "Supervisor",
  team_member: "Viewer",
  on_call: "On Call",
  staff: "Team Member",
};
