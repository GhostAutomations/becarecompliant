import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signTrainingCertificate } from "@/lib/training/storage";

/**
 * Signed download for a training certificate. The person_training row is read
 * through the caller's RLS client, so only an Admin or the record's branch Manager
 * can reach it; the download is audit-logged and served via a 5 minute signed URL.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) {
    return NextResponse.json({ error: "No company context." }, { status: 400 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("person_training")
    .select("id, company_id, certificate_path")
    .eq("id", id)
    .maybeSingle();
  if (!rec || rec.company_id !== profile.company_id || !rec.certificate_path) {
    return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
  }

  const signed = await signTrainingCertificate({
    companyId: rec.company_id,
    recordId: rec.id,
    path: rec.certificate_path,
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });
  return NextResponse.redirect(signed.url);
}
