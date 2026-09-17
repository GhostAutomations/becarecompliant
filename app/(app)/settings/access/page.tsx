import type { Metadata } from "next";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { ROLE_LABELS } from "@/lib/nav";
import { MODULES, isLocked, disabledKey } from "@/lib/auth/module-catalogue";
import { disabledModules } from "@/lib/auth/module-access";
import RoleAccessTile from "@/components/settings/role-access-tile";

export const metadata: Metadata = { title: "User access" };

/**
 * Settings, User access: which departments each role opens.
 *
 * Phil, 2026-09-17: "in settings we need user access and select what each role sees ... that role
 * gets a tiles with call departments / views, if they are ticked, that role gets access to it."
 *
 * ADMINS ONLY (requireCompanyAdmin). It decides who reaches safeguarding records, which is an
 * owner's decision rather than a manager's.
 *
 * A ROLE WITH NOTHING TO OFFER IS NOT SHOWN. `staff` is a carer's own login with one destination
 * and no departments, and a tile of greyed boxes would only invite somebody to try.
 */
const ROLE_ORDER = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "on_call",
  "team_member",
];

export default async function AccessSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  const disabled = await disabledModules(profile.company_id ?? null);

  const roles = ROLE_ORDER.filter((role) => MODULES.some((m) => m.roles.includes(role)));

  return (
    <div className="page-shell">
      <BackLink href="/settings" label="Back to Settings" />
      <h1 className="page-title mt-1">User access</h1>
      <p className="page-subtitle">
        Which departments each role opens. Untick one and it disappears from that role&apos;s
        menu, and typing the address goes nowhere either.
      </p>

      <div className="glass-card mt-5 p-5 text-sm text-white/65">
        <p>
          A greyed tick is one this role can never have, with the reason beside it. These are fixed
          by the product, not by your company: they are the checks that stop a setting handing
          somebody a department the rest of the system would refuse them anyway.
        </p>
        <p className="mt-3">
          This is about departments, not records. A Supervisor with Complaints ticked still sees
          only the branches she is assigned to, and that does not change here.
        </p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <RoleAccessTile
            key={role}
            role={role}
            roleLabel={ROLE_LABELS[role] ?? role}
            modules={MODULES.map((m) => ({
              key: m.key,
              label: m.label,
              note: m.note ?? null,
              allowed: m.roles.includes(role),
              locked: isLocked(m.key, role),
              on: m.roles.includes(role) && !disabled.has(disabledKey(role, m.key)),
            }))}
          />
        ))}
      </section>
    </div>
  );
}
