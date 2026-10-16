import type { NextRequest } from "next/server";
import { requireRotaOffice } from "@/lib/rota/access";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { pdfResponse, exportError } from "@/lib/export/deliver";
import { loadVisitRecord, renderVisitRecordPdf } from "@/lib/rota/visit-record-data";

/**
 * The Visit record PDF for the office (Rota and Visits Stage 5, decisions 2 and 10): the latest
 * version, or ?v=N for an earlier one, or everything so far when the visit has none yet. Read with
 * the office person's own client, so RLS keeps them to their own branches. Audit logged.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return exportError("Visit not found.", 404);
  const supabase = await createClient();
  const asked = Number(req.nextUrl.searchParams.get("v") ?? "");
  let q = supabase.from("rota_visit_record_versions").select("version, made_at").eq("visit_id", id).eq("company_id", companyId);
  q = Number.isInteger(asked) && asked > 0 ? q.eq("version", asked) : q.order("version", { ascending: false }).limit(1);
  const { data: versions } = await q;
  const v = ((versions ?? []) as Array<{ version: number; made_at: string }>)[0] ?? null;
  if (asked > 0 && !v) return exportError("That version was not found.", 404);

  const facts = await loadVisitRecord(supabase, { companyId, visitId: id, version: v ? { version: v.version, madeAt: v.made_at } : null });
  if (!facts) return exportError("Visit not found.", 404);

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "rota.visit_record_downloaded",
    entityType: "service_user",
    entityId: facts.serviceUserId,
    summary: `Downloaded the Visit record for ${facts.input.visitDate} ${facts.input.startTime}${v && v.version > 1 ? `, version ${v.version}` : ""}`,
    metadata: { visit_id: id, version: v?.version ?? null },
  });
  return pdfResponse(await renderVisitRecordPdf(facts.input), `visit-record-${facts.input.visitDate}-${facts.input.startTime.replace(":", "")}`);
}
