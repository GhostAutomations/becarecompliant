import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import { resolveReportScope } from "@/lib/export/context";
import { renderReportPdf } from "@/lib/export/pdf";
import { buildComplianceReport } from "@/lib/export/reports";
import { pdfResponse, csvResponse, exportError } from "@/lib/export/deliver";

/** Branch / company compliance report (People + Service Users). Pro and above. */
export async function GET(req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context for this report.", 400);
  if (!(await featureEnabled(profile.company_id, "reporting_exports"))) {
    return exportError("Reporting exports are available on the Pro tier and above.", 403);
  }

  const params = req.nextUrl.searchParams;
  const format = params.get("format") === "csv" ? "csv" : "pdf";
  const scope = await resolveReportScope(profile.company_id, params.get("branch"));

  const built = await buildComplianceReport({
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
    summary: `Exported compliance report (${format.toUpperCase()})`,
    metadata: { report: "compliance", branch_id: scope.branchId, format },
  });

  if (format === "csv") return csvResponse(built.csv, built.base);
  const pdf = await renderReportPdf(built.doc);
  return pdfResponse(pdf, built.base);
}
