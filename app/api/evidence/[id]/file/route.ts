import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signEvidenceDownload } from "@/lib/evidence/storage";

/**
 * Signed download for a single evidence file / signature. The evidence_files row is
 * read through the caller's RLS client (so only someone allowed to see the parent
 * evidence can reach it), then served via a 5 minute signed URL and audit-logged.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) {
    return NextResponse.json({ error: "No company context." }, { status: 400 });
  }
  const { id } = await ctx.params;
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing field." }, { status: 400 });

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("evidence_files")
    .select("company_id, storage_path, file_name")
    .eq("evidence_id", id)
    .eq("field_key", key)
    .not("storage_path", "is", null)
    .limit(1);
  const file = rows?.[0];
  if (!file || file.company_id !== profile.company_id || !file.storage_path) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const signed = await signEvidenceDownload({
    companyId: file.company_id,
    evidenceId: id,
    path: file.storage_path,
    label: `file ${file.file_name ?? ""}`.trim(),
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });
  return NextResponse.redirect(signed.url);
}
