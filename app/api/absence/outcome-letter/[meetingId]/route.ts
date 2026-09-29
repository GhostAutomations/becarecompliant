import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signEvidenceDownload } from "@/lib/evidence/storage";
import { exportError } from "@/lib/export/deliver";

/**
 * Download an absence meeting's outcome letter PDF (0343). The row is read through the caller's
 * RLS client, so only the people who prepare that person's meetings get a link; the file is handed
 * over as a 5 minute signed URL and the download is written to the audit log.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const { profile } = await requireCompany();
  const { meetingId } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_outcome_letters")
    .select("company_id, evidence_id, pdf_path")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!data?.pdf_path || !data.evidence_id) return exportError("That letter could not be found.", 404);
  const res = await signEvidenceDownload({
    companyId: data.company_id as string,
    evidenceId: data.evidence_id as string,
    path: data.pdf_path as string,
    label: "absence outcome letter",
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!res.ok) return exportError(res.error, 404);
  return Response.redirect(res.url, 302);
}
