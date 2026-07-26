import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signPolicyDocument } from "@/lib/assignments/storage";

/**
 * Signed download for a company policy.
 *
 * The row is read through the CALLER'S RLS client, so the policy select policy
 * decides who gets it: anyone who runs the service, plus a Team Member the policy
 * is actually assigned to. A staff member cannot pull a policy nobody gave them.
 * The download is audit-logged and served through a 5 minute signed URL.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) {
    return NextResponse.json({ error: "No company context." }, { status: 400 });
  }
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("company_policies")
    .select("id, company_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!policy || policy.company_id !== profile.company_id || !policy.storage_path) {
    return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  }

  const signed = await signPolicyDocument({
    companyId: policy.company_id as string,
    policyId: policy.id as string,
    path: policy.storage_path as string,
    actor: { id: profile.id, email: profile.email, role: profile.role },
  });
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });

  // Stream it back from OUR origin rather than redirecting the browser to the
  // signed URL. Two reasons, both practical: the reader renders the pages with
  // pdf.js, which would otherwise be a cross-origin fetch at the mercy of the
  // bucket's CORS, and the signed URL never reaches the browser at all, so it
  // cannot be copied out of the address bar and shared while it lives.
  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "The document could not be read." }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
