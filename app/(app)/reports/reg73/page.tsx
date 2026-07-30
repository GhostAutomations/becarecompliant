import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import StartVisitButton from "@/components/reg73/start-visit-button";

export const metadata: Metadata = { title: "Regulation 73 visits" };

const VIEW_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];
const START_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];

export default async function Reg73ListPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/reports");
  const canStart = START_ROLES.includes(profile.role);

  const branches = await listAccessibleBranchTypes(profile.company_id, profile.role, user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href="/reports" label="Back to reports" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Regulation 73 visits</h1>
          <p className="page-subtitle">
            The Responsible Individual branch visit report, pre-filled from the site. One per branch.
          </p>
        </div>
        <Link href="/reports/reg73/reports" className="btn-outline px-3 py-2 text-xs">
          R73 Reports
        </Link>
      </div>

      {branches.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">No branches to visit yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {branches.map((b) => (
            <section key={b.id} className="glass-card flex items-center justify-between gap-3 p-5">
              <h2 className="text-base font-semibold text-white">{b.name}</h2>
              {canStart ? <StartVisitButton branchId={b.id} /> : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
