import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import { resolveReportScope } from "@/lib/export/context";
import { renderReportPdf } from "@/lib/export/pdf";
import { buildTrainingReport } from "@/lib/export/training";
import { pdfResponse, csvResponse, exportError } from "@/lib/export/deliver";

/** Training compliance report (PQS mandatory + safeguarding rates). Pro and above. */
export async function GET(req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context for this report.", 400);
  if (!["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"].includes(profile.role)) {
    return exportError("Training reports are for Admins and Managers.", 403);
  }
  if (!(await featureEnabled(profile.company_id, "reporting_exports"))) {
    return exportError("Reporting exports are available on the Pro tier and above.", 403);
  }

  const params = req.nextUrl.searchParams;
  const format = params.get("format") === "csv" ? "csv" : "pdf";
  const scope = await resolveReportScope(profile.company_id, params.get("branch"));

  const built = await buildTrainingReport({
    companyId: profile.company_id,
    companyName: scope.companyName,
    branchId: scope.branchId,
    branchName: scope.branchName,
  });

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "report.exported",
    entityType: "report",
    entityId: null,
    summary: `Exported training report (${format.toUpperCase()})`,
    metadata: { report: "training", branch_id: scope.branchId, format },
  });

  if (format === "csv") return csvResponse(built.csv, built.base);
  return pdfResponse(await renderReportPdf(built.doc), built.base);
}
