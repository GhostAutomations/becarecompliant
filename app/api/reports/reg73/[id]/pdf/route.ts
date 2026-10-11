import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { renderReportPdf } from "@/lib/export/pdf";
import { pdfResponse, exportError } from "@/lib/export/deliver";
import { getReg73Visit } from "@/lib/reg73/data";
import { buildReg73Doc } from "@/lib/reg73/pdf-doc";
import { getBranchTerms } from "@/lib/branches/company-word";
import { canViewRegReport, REG_REPORT_REFUSED } from "@/lib/reg73/roles";

/** Branded PDF of one Regulation 73 visit. RLS authorises the read:
 *  Admins and the Registered roles every branch, a Branch Manager their own branches (audit F16). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context.", 400);
  // Refused by role before anything is read; another branch's report is then not found (RLS).
  if (!canViewRegReport(profile.role)) return exportError(REG_REPORT_REFUSED, 403);
  const { id } = await ctx.params;

  const visit = await getReg73Visit(id);
  if (!visit || visit.company_id !== profile.company_id) return exportError("Visit not found.", 404);

  const supabase = await createClient();
  const [{ data: branch }, { data: company }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", visit.branch_id).maybeSingle(),
    supabase.from("companies").select("name").eq("id", visit.company_id).maybeSingle(),
  ]);
  const branchName = (branch?.name as string) ?? "Branch";
  const doc = buildReg73Doc(visit, branchName, (company?.name as string) ?? "Company", (await getBranchTerms(profile.company_id)).one);

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg73.exported",
    entityType: "reg73_visit",
    entityId: visit.id,
    summary: `Exported the Regulation 73 visit for ${branchName}`,
    metadata: {},
  });

  return pdfResponse(await renderReportPdf(doc), `reg73-${branchName.replace(/\s+/g, "-").toLowerCase()}`);
}
