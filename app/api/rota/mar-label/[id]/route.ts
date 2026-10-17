import { NextResponse } from "next/server";
import { requireRotaOffice } from "@/lib/rota/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { exportError } from "@/lib/export/deliver";
import { pathInCompany, PATH_REFUSED } from "@/lib/storage/company-path";

/**
 * A MAR medicine's label photo (Rota and Visits Stage 6, 0503): for the rota office of the service
 * user's branch only (the medicine row is read with their own client, so RLS decides), the stored
 * path checked to be inside the company, a one minute signed link, every view audit logged.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return exportError("Photo not found.", 404);
  const supabase = await createClient();
  const { data: med } = await supabase
    .from("rota_mar_medicines")
    .select("id, name, label_path, company_id, service_user_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; name: string; label_path: string | null; company_id: string; service_user_id: string }>();
  if (!med?.label_path) return exportError("Photo not found.", 404);
  if (!pathInCompany(med.label_path, med.company_id)) return exportError(PATH_REFUSED, 403);
  const { data: signed, error } = await createServiceClient().storage.from("mar-labels").createSignedUrl(med.label_path, 60);
  if (error || !signed) return exportError("The photo could not be opened.", 500);
  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "rota.mar_label_viewed",
    entityType: "service_user",
    entityId: med.service_user_id,
    summary: `Viewed the label photo of ${med.name}`,
    metadata: { medicine_id: med.id },
  });
  return NextResponse.redirect(signed.signedUrl);
}
