import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { renderReportPdf } from "@/lib/export/pdf";
import { pdfResponse, exportError } from "@/lib/export/deliver";
import { getReg80Review } from "@/lib/reg80/data";
import { buildReg80Doc } from "@/lib/reg80/pdf-doc";

/** Branded PDF of one Regulation 80 quality of care review. RLS authorises the read. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context.", 400);
  const { id } = await ctx.params;

  const review = await getReg80Review(id);
  if (!review || review.company_id !== profile.company_id) return exportError("Review not found.", 404);

  const supabase = await createClient();
  const [{ data: branch }, { data: company }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", review.branch_id).maybeSingle(),
    supabase.from("companies").select("name").eq("id", review.company_id).maybeSingle(),
  ]);
  const branchName = (branch?.name as string) ?? "Branch";
  const doc = buildReg80Doc(review, branchName, (company?.name as string) ?? "Company");

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg80.exported",
    entityType: "reg80_review",
    entityId: review.id,
    summary: `Exported the Regulation 80 review for ${branchName}`,
    metadata: {},
  });

  return pdfResponse(await renderReportPdf(doc), `reg80-${branchName.replace(/\s+/g, "-").toLowerCase()}`);
}
