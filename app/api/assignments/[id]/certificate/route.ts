import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import { appendSignaturePage } from "@/lib/assignments/signed-copy";

/**
 * The SIGNED COPY of a policy: the document they read, with a signature page
 * appended, rendered on demand.
 *
 * Phil, 2026-07-27: "instead of a certificate showing them they signed
 * something, why dont we just generate the pdf of the document they signed, with
 * the date, time and signature?" So this no longer produces a separate
 * certificate. One file: the wording AND who signed it, when, and their mark.
 *
 * On demand rather than stored, exactly like the evidence PDF: the Evidence is
 * frozen and the render is deterministic, so it can always be reproduced and
 * never goes stale in a bucket. Crucially it fetches the VERSION THEY SIGNED,
 * not the current one, so a later edit can never rewrite history.
 *
 * Who can fetch it is decided by RLS on the rows themselves: the person who
 * signed, their Branch Manager, a company-wide role, or the founder. The
 * download is audited.
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
      "id, company_id, kind, status, evidence_id, policy_id, policy_version, company_policies:policy_id(title, file_name, storage_path), people:person_id(full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!assignment || assignment.kind !== "policy" || !assignment.evidence_id) {
    return NextResponse.json({ error: "Nothing signed to show." }, { status: 404 });
  }

  const { data: evidence } = await supabase
    .from("evidence")
    .select("id, answers, submitted_at, author_name, company_id")
    .eq("id", assignment.evidence_id)
    .maybeSingle();
  if (!evidence) {
    return NextResponse.json({ error: "Nothing signed to show." }, { status: 404 });
  }

  const answers = (evidence.answers ?? {}) as Record<string, unknown>;
  const policy = (Array.isArray(assignment.company_policies)
    ? assignment.company_policies[0]
    : assignment.company_policies) as
    | { title: string; file_name: string; storage_path: string }
    | null;
  const person = (Array.isArray(assignment.people)
    ? assignment.people[0]
    : assignment.people) as { full_name: string } | null;

  const admin = createServiceClient();
  const signedVersion = Number(answers["policy_version"] ?? assignment.policy_version ?? 1);

  // The document AS SIGNED. company_policy_versions holds every version's file,
  // so an edit made afterwards cannot change what this download shows.
  let documentPath: string | null = policy?.storage_path ?? null;
  if (assignment.policy_id) {
    const { data: version } = await admin
      .from("company_policy_versions")
      .select("storage_path")
      .eq("policy_id", assignment.policy_id)
      .eq("version", signedVersion)
      .maybeSingle();
    if (version?.storage_path) documentPath = version.storage_path as string;
  }

  let original: Buffer | null = null;
  if (documentPath) {
    const dl = await admin.storage.from(EVIDENCE_BUCKET).download(documentPath);
    if (dl.data) original = Buffer.from(await dl.data.arrayBuffer());
  }

  // The drawn signature lives in the private bucket as a PNG.
  let signaturePng: Buffer | null = null;
  const { data: sigFile } = await admin
    .from("evidence_files")
    .select("storage_path")
    .eq("evidence_id", evidence.id)
    .eq("kind", "signature")
    .maybeSingle();
  if (sigFile?.storage_path) {
    const dl = await admin.storage.from(EVIDENCE_BUCKET).download(sigFile.storage_path as string);
    if (dl.data) signaturePng = Buffer.from(await dl.data.arrayBuffer());
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

  const pdf = await appendSignaturePage(original, {
    companyName: (company?.name as string | null) ?? "Your company",
    policyTitle: (answers["policy"] as string) ?? policy?.title ?? "Policy",
    policyVersion: signedVersion,
    signerName:
      (answers["name"] as string) ??
      person?.full_name ??
      (evidence.author_name as string | null) ??
      "Team member",
    signedAt: new Date(evidence.submitted_at as string),
    signaturePng,
    typedSignature: typed,
    reference: evidence.id as string,
  });

  await writeAudit({
    companyId: evidence.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.signed_copy_downloaded",
    entityType: "assignment",
    entityId: id,
    summary: "Downloaded a signed policy",
    metadata: { evidence_id: evidence.id, version: signedVersion },
  });

  const safeTitle = ((answers["policy"] as string) ?? policy?.title ?? "policy")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .slice(0, 60) || "policy";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeTitle} - signed.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
