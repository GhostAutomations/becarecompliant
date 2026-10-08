import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { exportError } from "@/lib/export/deliver";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";

/**
 * A ticket's screenshot. Read through the caller's RLS client (can_see_support_ticket, 0432), so
 * only someone who can see the ticket gets it, handed over as a 5 minute signed URL, and the
 * viewing is written to the audit log.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { profile } = await requireCompany();
  const { id, n } = await ctx.params;
  const index = Number(n);
  const { data } = await (await createClient())
    .from("support_tickets")
    .select("company_id, screenshots")
    .eq("id", id)
    .maybeSingle();
  const shots = Array.isArray(data?.screenshots) ? (data!.screenshots as Array<{ path: string }>) : [];
  const shot = Number.isInteger(index) && index >= 0 ? shots[index] : undefined;
  if (!data || !shot?.path) return exportError("That screenshot could not be found.", 404);
  const { data: signed, error } = await createServiceClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(shot.path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) return exportError("The screenshot could not be opened.", 404);
  await writeAudit({
    companyId: data.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "ticket.screenshot_viewed",
    entityType: "support_ticket",
    entityId: id,
    summary: "Viewed a ticket screenshot",
    metadata: { index },
  });
  return Response.redirect(signed.signedUrl, 302);
}
