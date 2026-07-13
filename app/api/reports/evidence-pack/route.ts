import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import {
  getEvidencePackData,
  renderEvidencePackPdf,
  evidencePackCsv,
} from "@/lib/export/evidence-pack";
import { pdfResponse, csvResponse, exportError } from "@/lib/export/deliver";

/** Inspection ready Evidence pack for one Person or Service User. Pro and above
 * (a whole pack is more than the single record Evidence PDF that Business gets). */
export async function GET(req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context for this pack.", 400);
  if (!(await featureEnabled(profile.company_id, "reporting_exports"))) {
    return exportError("Evidence packs are available on the Pro tier and above.", 403);
  }

  const params = req.nextUrl.searchParams;
  const recordType = params.get("type") === "service_user" ? "service_user" : "person";
  const recordId = params.get("record");
  const format = params.get("format") === "csv" ? "csv" : "pdf";
  if (!recordId) return exportError("A record must be given for an evidence pack.", 400);

  const data = await getEvidencePackData(recordType, recordId);
  if (!data.ok) return exportError(data.error, 404);

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "report.exported",
    entityType: recordType,
    entityId: recordId,
    summary: `Exported evidence pack for ${data.data.recordName} (${format.toUpperCase()})`,
    metadata: { report: "evidence_pack", record_type: recordType, format, evidence_count: data.data.evidence.length },
  });

  const base = `evidence-pack-${data.data.recordName.replace(/\s+/g, "-").toLowerCase()}`;
  if (format === "csv") return csvResponse(evidencePackCsv(data.data), base);
  const pdf = await renderEvidencePackPdf(data.data);
  return pdfResponse(pdf, base);
}
