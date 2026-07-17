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
import { buildOnTimeReport, resolveOnTimeWindow } from "@/lib/export/on-time";
import { buildTrainingReport } from "@/lib/export/training";
import { listBranches } from "@/lib/people/data";
import type { ReportDoc } from "@/lib/export/pdf";
import BackLink from "@/components/back-link";
import ReportDocView from "@/components/reports/report-doc-view";
import ReportBranchSelect from "@/components/reports/report-branch-select";

export const metadata: Metadata = { title: "Report" };

type ReportType = "people" | "service_users" | "compliance" | "on-time" | "training";

export default async function ReportViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireCompany();
  if (!["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"].includes(profile.role)) {
    redirect("/dashboard");
  }
  if (!profile.company_id) redirect("/founder");

  const { type } = await params;
  if (
    type !== "people" &&
    type !== "service_users" &&
    type !== "compliance" &&
    type !== "on-time" &&
    type !== "training"
  ) {
    redirect("/reports");
  }
  const reportType = type as ReportType;
  const isTraining = reportType === "training";

  const isOnTime = reportType === "on-time";
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v : null);
  const branches = await listBranches(profile.company_id);
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));

  // Branch is chosen inside the view. The PQS report is always a single branch, so
  // it defaults to the first branch; the others default to all branches.
  const branchParam = str(sp.branch);
  const effectiveBranch = branchParam ?? (isOnTime ? branchOptions[0]?.id ?? null : null);
  const branchValue = effectiveBranch ?? "all";
  const scope = await resolveReportScope(profile.company_id, effectiveBranch);

  // The on time report uses a "last 6 months" default window; the other reports
  // default to overdue + 30 days. Both carry From/To through to the download.
  const win = isOnTime
    ? resolveOnTimeWindow(str(sp.from), str(sp.to))
    : resolveReportWindow(str(sp.from), str(sp.to));

  // The PQS report needs a branch; only reachable with none when the company has no
  // branches at all.
  if (isOnTime && !scope.branchId) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <BackLink href="/reports" label="Back to reports" />
        <div className="glass-card p-6 text-sm text-white/70">
          The PQS report is always for a single branch, and this company has no branches set up yet.
        </div>
      </div>
    );
  }

  const base = {
    companyId: profile.company_id,
    companyName: scope.companyName,
    branchId: scope.branchId,
    branchName: scope.branchName,
  };

  let doc: ReportDoc;
  let exportPath: string;
  let populationQuery = "";
  if (reportType === "training") {
    doc = (await buildTrainingReport(base)).doc;
    exportPath = "/api/reports/training";
  } else if (reportType === "on-time") {
    doc = (await buildOnTimeReport({ ...base, window: { from: win.from ?? "", to: win.to } })).doc;
    exportPath = "/api/reports/on-time";
  } else if (reportType === "compliance") {
    doc = (await buildComplianceReport({ ...base, window: win })).doc;
    exportPath = "/api/reports/compliance";
  } else if (reportType === "service_users") {
    doc = (await buildServiceUserRegisterReport({ ...base, window: win })).doc;
    exportPath = "/api/reports/register";
    populationQuery = "population=service_users&";
  } else {
    doc = (await buildPeopleRegisterReport({ ...base, window: win })).doc;
    exportPath = "/api/reports/register";
    populationQuery = "population=people&";
  }

  const exportHref = (format: "pdf" | "csv") =>
    `${exportPath}?${populationQuery}branch=${encodeURIComponent(branchValue)}&from=${win.from ?? ""}&to=${win.to}&format=${format}`;

  const entitled = await featureEnabled(profile.company_id, "reporting_exports");
  const selfPath = `/reports/view/${reportType}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <BackLink href="/reports" label="Back to reports" />

      {isTraining ? (
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
          <ReportBranchSelect branches={branchOptions} value={branchValue} allowAll={!isOnTime} />
          <p className="pb-2 text-[11px] text-white/45">
            Live snapshot of training compliance. There is no date range: it always reflects today.
          </p>
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
      ) : (
        <form method="get" action={selfPath} className="glass-card p-4">
          <input type="hidden" name="branch" value={branchValue} />
          <div className="flex flex-wrap items-end gap-3">
            <ReportBranchSelect branches={branchOptions} value={branchValue} allowAll={!isOnTime} />
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
            {isOnTime
              ? "The PQS on time rates default to the last 6 months. Change the dates to look at a different period."
              : "Leave From blank to include everything overdue. To defaults to 30 days ahead."}
          </p>
        </form>
      )}

      <ReportDocView doc={doc} />
    </div>
  );
}
