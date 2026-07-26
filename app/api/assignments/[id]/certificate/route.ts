import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import { renderCertificate } from "@/lib/assignments/certificate";

/**
 * The certificate of signature for a signed policy, rendered on demand.
 *
 * On demand rather than stored, exactly like the evidence PDF: the Evidence is
 * frozen and the render is deterministic, so the certificate can always be
 * reproduced and never goes stale in a bucket.
 *
 * Who can fetch it is decided by RLS on the rows themselves: the person who
 * signed (their own assignment and their own authored Evidence), their Branch
 * Manager, a company-wide role, or the founder. The download is audited.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) {
    return NextResponse.json({ error: "No company context." }, { status: 400 });
  }
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select(
      "id, company_id, kind, status, evidence_id, policy_version, company_policies:policy_id(title, file_name), people:person_id(full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!assignment || assignment.kind !== "policy" || !assignment.evidence_id) {
    return NextResponse.json({ error: "No certificate for this." }, { status: 404 });
  }

  const { data: evidence } = await supabase
    .from("evidence")
    .select("id, answers, submitted_at, author_name, company_id")
    .eq("id", assignment.evidence_id)
    .maybeSingle();
  if (!evidence) {
    return NextResponse.json({ error: "No certificate for this." }, { status: 404 });
  }

  const answers = (evidence.answers ?? {}) as Record<string, unknown>;
  const policy = (Array.isArray(assignment.company_policies)
    ? assignment.company_policies[0]
    : assignment.company_policies) as { title: string; file_name: string } | null;
  const person = (Array.isArray(assignment.people)
    ? assignment.people[0]
    : assignment.people) as { full_name: string } | null;

  // The drawn signature lives in the private bucket as a PNG; pull it back as a
  // data URL so it can be drawn into the certificate.
  let signatureDataUrl: string | null = null;
  const admin = createServiceClient();
  const { data: sigFile } = await admin
    .from("evidence_files")
    .select("storage_path")
    .eq("evidence_id", evidence.id)
    .eq("kind", "signature")
    .maybeSingle();
  if (sigFile?.storage_path) {
    const dl = await admin.storage.from(EVIDENCE_BUCKET).download(sigFile.storage_path as string);
    if (dl.data) {
      const bytes = Buffer.from(await dl.data.arrayBuffer());
      signatureDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    }
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", evidence.company_id)
    .maybeSingle();

  const typed =
    typeof answers["signature_typed"] === "string" && answers["signature_typed"].trim()
      ? (answers["signature_typed"] as string).trim()
      : null;

  const pdf = await renderCertificate({
    companyName: (company?.name as string | null) ?? "Your company",
    policyTitle: (answers["policy"] as string) ?? policy?.title ?? "Policy",
    policyVersion: Number(answers["policy_version"] ?? assignment.policy_version ?? 1),
    policyFileName: policy?.file_name ?? "policy",
    signerName:
      (answers["name"] as string) ??
      person?.full_name ??
      (evidence.author_name as string | null) ??
      "Team member",
    signedAt: new Date(evidence.submitted_at as string),
    signatureDataUrl,
    typedSignature: typed,
    reference: evidence.id as string,
  });

  await writeAudit({
    companyId: evidence.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.certificate_downloaded",
    entityType: "assignment",
    entityId: id,
    summary: "Downloaded a certificate of signature",
    metadata: { evidence_id: evidence.id },
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="signature-certificate.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
