import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { resolveReportScope } from "@/lib/export/context";
import {
  buildPeopleRegisterReport,
  buildServiceUserRegisterReport,
  buildComplianceReport,
  resolveReportWindow,
} from "@/lib/export/reports";
import type { ReportDoc } from "@/lib/export/pdf";
import BackLink from "@/components/back-link";
import ReportDocView from "@/components/reports/report-doc-view";

export const metadata: Metadata = { title: "Report" };

type ReportType = "people" | "service_users" | "compliance";

export default async function ReportViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireCompany();
  if (!["platform_admin", "company_admin", "manager"].includes(profile.role)) {
    redirect("/dashboard");
  }
  if (!profile.company_id) redirect("/founder");

  const { type } = await params;
  if (type !== "people" && type !== "service_users" && type !== "compliance") {
    redirect("/reports");
  }
  const reportType = type as ReportType;

  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v : null);
  const branchParam = str(sp.branch);
  const scope = await resolveReportScope(profile.company_id, branchParam);
  const win = resolveReportWindow(str(sp.from), str(sp.to));

  const input = {
    companyId: profile.company_id,
    companyName: scope.companyName,
    branchId: scope.branchId,
    branchName: scope.branchName,
    window: win,
  };

  let doc: ReportDoc;
  let exportPath: string;
  if (reportType === "compliance") {
    doc = (await buildComplianceReport(input)).doc;
    exportPath = "/api/reports/compliance";
  } else if (reportType === "service_users") {
    doc = (await buildServiceUserRegisterReport(input)).doc;
    exportPath = "/api/reports/register";
  } else {
    doc = (await buildPeopleRegisterReport(input)).doc;
    exportPath = "/api/reports/register";
  }

  const branchValue = branchParam ?? "all";
  const populationQuery = reportType === "compliance" ? "" : `population=${reportType}&`;
  const exportHref = (format: "pdf" | "csv") =>
    `${exportPath}?${populationQuery}branch=${encodeURIComponent(branchValue)}&from=${win.from ?? ""}&to=${win.to}&format=${format}`;

  const entitled = await featureEnabled(profile.company_id, "reporting_exports");
  const selfPath = `/reports/view/${reportType}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <BackLink href="/reports" label="Back to reports" />

      <form method="get" action={selfPath} className="glass-card p-4">
        <input type="hidden" name="branch" value={branchValue} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="form-label">From</label>
            <input id="from" name="from" type="date" defaultValue={win.from ?? ""} />
          </div>
          <div>
            <label htmlFor="to" className="form-label">To</label>
            <input id="to" name="to" type="date" defaultValue={win.to} />
          </div>
          <button type="submit" className="btn-primary px-3 py-2 text-xs">Apply dates</button>
          <a href={selfPath} className="btn-outline px-3 py-2 text-xs">Reset</a>
          <span className="ml-auto flex items-center gap-2">
            {entitled ? (
              <>
                <a href={exportHref("pdf")} className="btn-outline px-3 py-2 text-xs">Download PDF</a>
                <a href={exportHref("csv")} className="btn-outline px-3 py-2 text-xs">Download CSV</a>
              </>
            ) : (
              <a href="/settings/billing" className="btn-outline px-3 py-2 text-xs">
                Downloads are a Pro feature
              </a>
            )}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-white/40">
          Leave From blank to include everything overdue. To defaults to 30 days ahead.
        </p>
      </form>

      <ReportDocView doc={doc} />
    </div>
  );
}
