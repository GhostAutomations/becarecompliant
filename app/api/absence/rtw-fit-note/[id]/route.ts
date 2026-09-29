import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { exportError } from "@/lib/export/deliver";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";

/**
 * View the fit note an employee uploaded with their Return to Work answers (0344), before it is
 * filed into the Evidence. Read through the caller's RLS client (can_run_rtw: Admin, the branch's
 * Manager or Supervisor, the person's supervisor), handed over as a 5 minute signed URL, and the
 * viewing is written to the audit log: it is health information.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("rtw_questionnaires")
    .select("company_id, person_id, fit_note_path")
    .eq("id", id)
    .maybeSingle();
  if (!data?.fit_note_path) return exportError("That fit note could not be found.", 404);
  const { data: signed, error } = await createServiceClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(data.fit_note_path as string, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) return exportError("The fit note could not be opened.", 404);
  await writeAudit({
    companyId: data.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.rtw_fit_note_viewed",
    entityType: "person",
    entityId: data.person_id as string,
    summary: "Viewed a fit note uploaded with Return to Work answers",
    metadata: { rtw_questionnaire_id: id },
  });
  return Response.redirect(signed.signedUrl, 302);
}
