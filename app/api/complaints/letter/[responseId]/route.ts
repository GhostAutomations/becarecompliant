import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signEvidenceDownload } from "@/lib/evidence/storage";
import { exportError } from "@/lib/export/deliver";

/**
 * Download a complaint response letter's PDF (Phil, 2026-10-12, THE LIST 54). The row is read
 * through the caller's RLS client, so only the people who work that complaint get a link; the file
 * is handed over as a short lived signed URL and the download is written to the audit log.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ responseId: string }> }) {
  const { profile } = await requireCompany();
  const { responseId } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaint_responses")
    .select("company_id, pdf_path, kind")
    .eq("id", responseId)
    .maybeSingle();
  if (!data?.pdf_path) return exportError("That letter could not be found.", 404);
  const res = await signEvidenceDownload({
    companyId: data.company_id as string,
    evidenceId: responseId,
    path: data.pdf_path as string,
    label: data.kind === "response" ? "the complaint response letter" : "the initial response letter",
    entityType: "complaint_response",
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!res.ok) return exportError(res.error, 404);
  return Response.redirect(res.url, 302);
}
