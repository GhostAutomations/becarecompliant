import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { evidenceSignedPdfUrl } from "@/lib/evidence/on-demand";
import { exportError } from "@/lib/export/deliver";

/**
 * On demand branded PDF for one Evidence. Available on every tier (a single
 * record's own evidence is allowed even on Business, per Phil's decision). The
 * evidence is read through the caller's RLS client, rendered from its frozen
 * snapshot, uploaded to the private bucket and handed back as a 5 minute signed
 * URL. signEvidenceDownload writes the evidence.downloaded audit row.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  const { id } = await ctx.params;
  const res = await evidenceSignedPdfUrl({
    evidenceId: id,
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!res.ok) return exportError(res.error, 404);
  return Response.redirect(res.url, 302);
}
