import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { resolveReportScope } from "@/lib/export/context";
import { renderReportPdf } from "@/lib/export/pdf";
import { buildDueReport } from "@/lib/export/due-reports";
import { DUE_REPORT_ROLES, isDueReportType } from "@/lib/export/due-report-types";
import { pdfResponse, csvResponse, exportError } from "@/lib/export/deliver";

/**
 * The Overdue and Due in 7, 14 and 30 day reports as PDF or CSV (Phil, 2026-10-05). Every tier,
 * like the dashboard tiles they belong to. Supervisors included, scoped to their branches by RLS.
 */
export async function GET(req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context for this report.", 400);
  if (!DUE_REPORT_ROLES.includes(profile.role)) {
    return exportError("These reports are for Admins, Managers and Supervisors.", 403);
  }
  const params = req.nextUrl.searchParams;
  const type = params.get("type") ?? "";
  if (!isDueReportType(type)) return exportError("Unknown report.", 400);
  const format = params.get("format") === "csv" ? "csv" : "pdf";
  const scope = await resolveReportScope(profile.company_id, params.get("branch"));

  const built = await buildDueReport({
    companyId: profile.company_id,
    companyName: scope.companyName,
    branchId: scope.branchId,
    branchName: scope.branchName,
    type,
  });

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "report.exported",
    entityType: "report",
    entityId: null,
    summary: `Exported ${built.doc.title} report (${format.toUpperCase()})`,
    metadata: { report: type, branch_id: scope.branchId, format },
  });

  if (format === "csv") return csvResponse(built.csv, built.base);
  return pdfResponse(await renderReportPdf(built.doc), built.base);
}
