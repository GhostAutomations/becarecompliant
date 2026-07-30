import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import { listReg80ReviewsForBranches } from "@/lib/reg80/data";
import Reg80ReportsManager from "@/components/reg80/reg80-reports-manager";

export const metadata: Metadata = { title: "R80 Reports" };

const VIEW_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];
const DELETE_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];

export default async function Reg80ReportsPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/reports");

  const branches = await listAccessibleBranchTypes(profile.company_id, profile.role, user.id);
  const reports = await listReg80ReviewsForBranches(
    profile.company_id,
    branches.map((b) => b.id),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href="/reports/reg80" label="Back to Regulation 80 reviews" />
      <div>
        <h1 className="page-title">R80 Reports</h1>
        <p className="page-subtitle">Every Regulation 80 review. Select to download or delete.</p>
      </div>
      <Reg80ReportsManager reports={reports} canDelete={DELETE_ROLES.includes(profile.role)} />
    </div>
  );
}
