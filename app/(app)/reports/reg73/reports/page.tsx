import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import { listReg73VisitsForBranches } from "@/lib/reg73/data";
import Reg73ReportsManager from "@/components/reg73/reg73-reports-manager";

export const metadata: Metadata = { title: "R73 Reports" };

const VIEW_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];
const DELETE_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];

export default async function Reg73ReportsPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/reports");

  const branches = await listAccessibleBranchTypes(profile.company_id, profile.role, user.id);
  const reports = await listReg73VisitsForBranches(
    profile.company_id,
    branches.map((b) => b.id),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href="/reports/reg73" label="Back to Regulation 73 visits" />
      <div>
        <h1 className="page-title">R73 Reports</h1>
        <p className="page-subtitle">Every Regulation 73 visit. Select to download or delete.</p>
      </div>
      <Reg73ReportsManager reports={reports} canDelete={DELETE_ROLES.includes(profile.role)} />
    </div>
  );
}
