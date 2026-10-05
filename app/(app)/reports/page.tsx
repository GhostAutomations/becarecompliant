import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import ReportsPanel from "@/components/reports/reports-panel";
import { getBranchTerms } from "@/lib/branches/company-word";
import { DUE_REPORT_ROLES } from "@/lib/export/due-report-types";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { profile } = await requireCompany();
  // Reports are a management view. Supervisors see only the four due reports (Phil, 2026-10-05:
  // the list behind each dashboard tile); Team Members do not run reports.
  if (!DUE_REPORT_ROLES.includes(profile.role)) redirect("/dashboard");
  if (!profile.company_id) redirect("/founder");
  const dueOnly = profile.role === "supervisor";

  const entitled = await featureEnabled(profile.company_id, "reporting_exports");

  return (
    <div className="page-shell space-y-8">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Inspection ready compliance reports and audit trail exports, as PDF or CSV.
        </p>
      </div>
      <ReportsPanel
        entitled={entitled}
        isAdmin={profile.role === "company_admin" || profile.role === "platform_admin"}
        dueOnly={dueOnly}
        branchWord={await getBranchTerms(profile.company_id)}
      />
    </div>
  );
}
