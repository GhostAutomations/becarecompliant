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
    | "absence";
  /** Roles allowed to see this entry. Undefined means everyone. */
  roles?: Role[];
  /** Nested sub-sections shown indented under this entry (e.g. under People). */
  children?: NavEntry[];
};

export const NAV_ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  {
    href: "/people",
    label: "People",
    icon: "people",
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
  { href: "/service-users", label: "Service Users", icon: "serviceUsers" },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
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
