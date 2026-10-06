import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signEvidenceDownload } from "@/lib/evidence/storage";
import { exportError } from "@/lib/export/deliver";

/**
 * Download the kept copy of an employee's absence meeting invitation (0406). Read through the
 * caller's RLS client, so only the people who prepare that person's meetings get a link; handed
 * over as a 5 minute signed URL, and the download is written to the audit log.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ letterId: string }> }) {
  const { profile } = await requireCompany();
  const { letterId } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_meeting_letters")
    .select("id, company_id, pdf_path")
    .eq("id", letterId)
    .maybeSingle();
  if (!data?.pdf_path) return exportError("That letter could not be found.", 404);
  const res = await signEvidenceDownload({
    companyId: data.company_id as string,
    evidenceId: data.id as string,
    path: data.pdf_path as string,
    label: "absence meeting invitation letter",
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!res.ok) return exportError(res.error, 404);
  return Response.redirect(res.url, 302);
}
