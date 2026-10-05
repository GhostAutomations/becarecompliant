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
import { buildDueReport } from "@/lib/export/due-reports";
import { DUE_REPORT_ROLES, isDueReportType, type DueReportType } from "@/lib/export/due-report-types";

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
  const { type } = await params;
  /* THE OVERDUE AND DUE IN 7, 14 AND 30 DAY REPORTS (Phil, 2026-10-05): the full list behind each
     dashboard tile. Supervisors may open these four (popup), scoped to their branches by RLS. */
  if (isDueReportType(type)) {
    if (!DUE_REPORT_ROLES.includes(profile.role)) redirect("/dashboard");
    if (!profile.company_id) redirect("/founder");
    return <DueReportView type={type} companyId={profile.company_id} profile={profile} searchParams={await searchParams} />;
  }
  if (!["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"].includes(profile.role)) {
    redirect("/dashboard");
  }
  if (!profile.company_id) redirect("/founder");

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
  const branches = await listBranches(profile.company_id, profile);
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));

  /*
   * Branch is chosen inside the view, and EVERY report can be run across all branches, the PQS
   * one included (Phil, 2026-07-30).
   *
   * It used to force a single branch, on the reasoning that local authority monitoring is per
   * contract. That is still true of a return you send Cardiff, and it made the company figures on
   * the dashboard impossible to open: the tile showing the whole company had nowhere to go. The
   * per branch view is one click away in the picker, so nothing is lost by allowing the roll up.
   */
  const branchParam = str(sp.branch);
  const effectiveBranch = branchParam === "all" ? null : branchParam;
  const branchValue = effectiveBranch ?? "all";
  const scope = await resolveReportScope(profile.company_id, effectiveBranch);

  // The on time report uses a "last 6 months" default window; the other reports
  // default to overdue + 30 days. Both carry From/To through to the download.
  const win = isOnTime
    ? resolveOnTimeWindow(str(sp.from), str(sp.to))
    : resolveReportWindow(str(sp.from), str(sp.to));

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

  // The People and Service User compliance registers are the BASIC report included on
  // every tier; every other report is Pro and above. Business cannot open a Pro report.
  const isBasicRegister = reportType === "people" || reportType === "service_users";
  const hasExports = await featureEnabled(profile.company_id, "reporting_exports");
  if (!isBasicRegister && !hasExports) redirect("/reports");
  const entitled = isBasicRegister || hasExports;
  const selfPath = `/reports/view/${reportType}`;

  return (
    <div className="page-shell space-y-5">
      <BackLink href="/reports" label="Back to reports" />

      {isTraining ? (
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
          <ReportBranchSelect branches={branchOptions} value={branchValue} allowAll />
          <p className="pb-2 text-[11px] text-white/45">
            Live snapshot of training compliance. There is no date range: it always reflects today.
          </p>
          <span className="ml-auto flex items-center gap-2">
            {entitled ? (
              <>
                <a href={exportHref("pdf")} download className="btn-outline px-3 py-2 text-xs">Download PDF</a>
                <a href={exportHref("csv")} download className="btn-outline px-3 py-2 text-xs">Download CSV</a>
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
            <ReportBranchSelect branches={branchOptions} value={branchValue} allowAll />
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
                  <a href={exportHref("pdf")} download className="btn-outline px-3 py-2 text-xs">Download PDF</a>
                  <a href={exportHref("csv")} download className="btn-outline px-3 py-2 text-xs">Download CSV</a>
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

/**
 * One of the four due reports. Live, so a branch picker and the downloads, and no date range:
 * the same shape as the Training report. Included on every tier, like the tiles that open them.
 */
async function DueReportView({
  type,
  companyId,
  profile,
  searchParams,
}: {
  type: DueReportType;
  companyId: string;
  profile: { id: string; role: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams.branch;
  const branchParam = typeof raw === "string" && raw.length > 0 ? raw : null;
  const effectiveBranch = branchParam === "all" ? null : branchParam;
  const branchValue = effectiveBranch ?? "all";
  const [branches, scope] = await Promise.all([
    listBranches(companyId, profile),
    resolveReportScope(companyId, effectiveBranch),
  ]);
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));
  const { doc } = await buildDueReport({
    companyId,
    companyName: scope.companyName,
    branchId: scope.branchId,
    branchName: scope.branchName,
    type,
  });
  const exportHref = (format: "pdf" | "csv") =>
    `/api/reports/due?type=${type}&branch=${encodeURIComponent(branchValue)}&format=${format}`;

  return (
    <div className="page-shell space-y-5">
      <BackLink href="/reports" label="Back to reports" />
      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <ReportBranchSelect branches={branchOptions} value={branchValue} allowAll />
        <p className="pb-2 text-[11px] text-white/45">
          Live list of what needs doing. There is no date range: it always reflects today.
        </p>
        <span className="ml-auto flex items-center gap-2">
          <a href={exportHref("pdf")} download className="btn-outline px-3 py-2 text-xs">Download PDF</a>
          <a href={exportHref("csv")} download className="btn-outline px-3 py-2 text-xs">Download CSV</a>
        </span>
      </div>
      <ReportDocView doc={doc} />
    </div>
  );
}
