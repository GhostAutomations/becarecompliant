export type NavEntry = {
  href: string;
  label: string;
  icon: "dashboard" | "people" | "serviceUsers";
};

export const NAV_ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/people", label: "People", icon: "people" },
  { href: "/service-users", label: "Service Users", icon: "serviceUsers" },
];

export const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Founder",
  company_admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  team_member: "Team Member",
};
