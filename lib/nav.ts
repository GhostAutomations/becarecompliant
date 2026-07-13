export type Role =
  | "platform_admin"
  | "company_admin"
  | "manager"
  | "supervisor"
  | "team_member";

export type NavEntry = {
  href: string;
  label: string;
  icon:
    | "dashboard"
    | "people"
    | "serviceUsers"
    | "settings"
    | "founder"
    | "holiday"
    | "absence"
    | "reports";
  /** Roles allowed to see this entry. Undefined means everyone. */
  roles?: Role[];
  /** Optional sidebar section heading shown above this entry (e.g. "Departments"). */
  group?: string;
  /** Nested sub-sections ("Sub Departments") shown indented under this entry. */
  children?: NavEntry[];
};

export const NAV_ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  {
    href: "/people",
    label: "People",
    icon: "people",
    group: "Departments",
    children: [
      { href: "/people/holiday", label: "Holiday", icon: "holiday" },
      {
        href: "/people/absence",
        label: "Absence",
        icon: "absence",
        roles: ["platform_admin", "company_admin", "manager", "supervisor"],
      },
    ],
  },
  { href: "/service-users", label: "Service Users", icon: "serviceUsers", group: "Departments" },
  {
    href: "/reports",
    label: "Reports",
    icon: "reports",
    group: "Departments",
    roles: ["platform_admin", "company_admin", "manager"],
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
  manager: "Manager",
  supervisor: "Supervisor",
  team_member: "Team Member",
};
