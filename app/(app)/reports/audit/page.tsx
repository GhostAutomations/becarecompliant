import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listCompanyAudit } from "@/lib/audit-log/data";
import BackLink from "@/components/back-link";
import AuditLogView from "@/components/reports/audit-log-view";

export const metadata: Metadata = { title: "Audit log" };

export default async function CompanyAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireCompany();
  // The company wide audit log is Company Admin only (RLS also enforces this).
  if (profile.role !== "company_admin" && profile.role !== "platform_admin") {
    redirect("/reports");
  }
  if (!profile.company_id) redirect("/founder");

  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v : null);
  const filters = {
    actor: str(sp.actor),
    entity: str(sp.entity),
    from: str(sp.from),
    to: str(sp.to),
  };

  const [entries, entitled] = await Promise.all([
    listCompanyAudit({ ...filters, companyId: profile.company_id }),
    featureEnabled(profile.company_id, "reporting_exports"),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink href="/reports" label="Back to reports" />
      <div>
        <h1 className="page-title">Company audit log</h1>
        <p className="page-subtitle">
          Every change made in your company, who made it and when. Read only.
        </p>
      </div>
      <AuditLogView
        entries={entries}
        filters={filters}
        formAction="/reports/audit"
        exportBase="/api/reports/audit?scope=company"
        scope="company"
        entitled={entitled}
      />
    </div>
  );
}
