import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import StartReviewButton from "@/components/reg80/start-review-button";

export const metadata: Metadata = { title: "Regulation 80 reviews" };

const VIEW_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];
const START_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];

export default async function Reg80ListPage() {
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
          <h1 className="page-title">Regulation 80 reviews</h1>
          <p className="page-subtitle">
            The six monthly Quality of Care review, pre-filled from the site. One per branch.
          </p>
        </div>
        <Link href="/reports/reg80/reports" className="btn-primary px-3 py-2 text-xs">
          R80 Reports
        </Link>
      </div>

      {branches.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">No branches to review yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {branches.map((b) => (
            <section key={b.id} className="glass-card flex items-center justify-between gap-3 p-5">
              <h2 className="text-base font-semibold text-white">{b.name}</h2>
              {canStart ? <StartReviewButton branchId={b.id} /> : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
