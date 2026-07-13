import type { NextRequest } from "next/server";
import { requireCompany, requireProfile } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import {
  getRecordAuditTrail,
  listCompanyAudit,
  listFounderAudit,
  type AuditEntry,
} from "@/lib/audit-log/data";
import { buildAuditReport } from "@/lib/export/audit";
import { renderReportPdf } from "@/lib/export/pdf";
import { pdfResponse, csvResponse, exportError } from "@/lib/export/deliver";

/**
 * Audit trail export. Three scopes:
 *   record   one Person / Service User history (Manager and above, via the RPC)
 *   company  the whole company log (Company Admin, RLS scoped)
 *   founder  cross company (Platform Admin only)
 * Company and record exports need reporting_exports (Pro and above); the founder
 * export is a platform capability and is not tier gated.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const scope = params.get("scope") ?? "company";
  const format = params.get("format") === "csv" ? "csv" : "pdf";
  const filters = {
    actor: params.get("actor"),
    entityType: params.get("entity"),
    from: params.get("from"),
    to: params.get("to"),
  };

  let entries: AuditEntry[] = [];
  let title = "Audit trail";
  let subtitle = "";
  let reference = `AUD-${new Date().toISOString().slice(0, 10)}`;
  let showCompany = false;
  let auditCompanyId: string | null = null;
  let auditRole = "";
  let auditActor = { id: "", email: "" };

  if (scope === "founder") {
    const { profile } = await requireProfile();
    if (profile.role !== "platform_admin") return exportError("Founder access only.", 403);
    entries = await listFounderAudit({ ...filters, companyId: params.get("company") });
    title = "Platform audit trail";
    subtitle = "All companies";
    showCompany = true;
    auditRole = profile.role;
    auditActor = { id: profile.id, email: profile.email };
  } else if (scope === "record") {
    const { profile } = await requireCompany();
    if (!profile.company_id) return exportError("No company context.", 400);
    if (!(await featureEnabled(profile.company_id, "reporting_exports"))) {
      return exportError("Reporting exports are available on the Pro tier and above.", 403);
    }
    const recordType = params.get("type") === "service_user" ? "service_user" : "person";
    const recordId = params.get("record");
    if (!recordId) return exportError("A record must be given.", 400);
    entries = await getRecordAuditTrail(recordType, recordId);
    title = "Record audit trail";
    subtitle = `${recordType === "service_user" ? "Service User" : "Person"} history`;
    reference = `AUD-REC-${new Date().toISOString().slice(0, 10)}`;
    auditCompanyId = profile.company_id;
    auditRole = profile.role;
    auditActor = { id: profile.id, email: profile.email };
  } else {
    // company
    const { profile } = await requireCompany();
    if (!profile.company_id) return exportError("No company context.", 400);
    if (profile.role !== "company_admin" && profile.role !== "platform_admin") {
      return exportError("The company audit log is available to Company Admins.", 403);
    }
    if (!(await featureEnabled(profile.company_id, "reporting_exports"))) {
      return exportError("Reporting exports are available on the Pro tier and above.", 403);
    }
    entries = await listCompanyAudit({ ...filters, companyId: profile.company_id });
    title = "Company audit trail";
    subtitle = "Your company";
    auditCompanyId = profile.company_id;
    auditRole = profile.role;
    auditActor = { id: profile.id, email: profile.email };
  }

  const { doc, csv } = buildAuditReport({
    title,
    subtitle,
    reference,
    meta: [{ label: "Scope", value: subtitle }],
    entries,
    showCompany,
  });

  await writeAudit({
    companyId: auditCompanyId,
    actorId: auditActor.id,
    actorEmail: auditActor.email,
    actorRole: auditRole,
    action: "report.exported",
    entityType: "report",
    entityId: null,
    summary: `Exported ${scope} audit trail (${format.toUpperCase()})`,
    metadata: { report: "audit", scope, format, entries: entries.length },
  });

  const base = `audit-${scope}`;
  if (format === "csv") return csvResponse(csv, base);
  const pdf = await renderReportPdf(doc);
  return pdfResponse(pdf, base);
}
