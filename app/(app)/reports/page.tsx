import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import ReportsPanel from "@/components/reports/reports-panel";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { profile } = await requireCompany();
  // Reports are a management view. Supervisors (caseload only) and Team Members
  // (read only register) do not run company reports.
  if (!["platform_admin", "company_admin", "manager"].includes(profile.role)) {
    redirect("/dashboard");
  }
  if (!profile.company_id) redirect("/founder");

  const entitled = await featureEnabled(profile.company_id, "reporting_exports");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Inspection ready compliance reports and audit trail exports, as PDF or CSV.
        </p>
      </div>
      <ReportsPanel
        entitled={entitled}
        isAdmin={profile.role === "company_admin" || profile.role === "platform_admin"}
      />
    </div>
  );
}
