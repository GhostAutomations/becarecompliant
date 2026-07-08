export type Role =
  | "platform_admin"
  | "company_admin"
  | "manager"
  | "supervisor"
  | "team_member";

export type NavEntry = {
  href: string;
  label: string;
  icon: "dashboard" | "people" | "serviceUsers" | "settings" | "founder";
  /** Roles allowed to see this entry. Undefined means everyone. */
  roles?: Role[];
};

export const NAV_ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/people", label: "People", icon: "people" },
  { href: "/service-users", label: "Service Users", icon: "serviceUsers" },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
    roles: ["company_admin"],
  },
  { href: "/founder", label: "Founder", icon: "founder", roles: ["platform_admin"] },
];

/** Nav entries visible to a given role. */
export function navEntriesForRole(role: string): NavEntry[] {
  return NAV_ENTRIES.filter(
    (entry) => !entry.roles || entry.roles.includes(role as Role),
  );
}

export const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Founder",
  company_admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  team_member: "Team Member",
};
