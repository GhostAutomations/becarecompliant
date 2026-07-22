export type Role =
  | "platform_admin"
  | "company_admin"
  | "registered_individual"
  | "registered_manager"
  | "manager"
  | "supervisor"
  | "team_member";

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
    | "invoicing"
    | "settings"
    | "founder"
    | "holiday"
    | "absence"
    | "training"
    | "compliance"
    | "outcomes"
    | "satisfaction"
    | "planner"
    | "whiteboard"
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
        roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager", "supervisor"],
      },
    ],
  },
  {
    href: "/service-users",
    label: "Service Users",
    icon: "serviceUsers",
    group: "Departments",
    children: [
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
    href: "/complaints",
    label: "Complaints",
    icon: "complaints",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"],
    children: [
      { href: "/complaints", label: "Open", icon: "complaints" },
      { href: "/complaints/closed", label: "Closed", icon: "complaints" },
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
      { href: "/invoicing/clients", label: "Private Clients", icon: "people" },
    ],
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
  const allowed = (entry: NavEntry) =>
    !entry.roles || entry.roles.includes(role as Role);
  return NAV_ENTRIES.filter(allowed).map((entry) =>
    entry.children
      ? { ...entry, children: entry.children.filter(allowed) }
      : entry,
  );
}

export const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Founder",
  company_admin: "Admin",
  registered_individual: "Registered Individual",
  registered_manager: "Registered Manager",
  manager: "Branch Manager",
  supervisor: "Supervisor",
  team_member: "Viewer",
};
