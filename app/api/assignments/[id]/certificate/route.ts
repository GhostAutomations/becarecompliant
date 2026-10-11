import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import { pathInCompany } from "@/lib/storage/company-path";
import { appendSignaturePage } from "@/lib/assignments/signed-copy";
import { renderWrittenPolicy } from "@/lib/policies/render";

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
      "id, company_id, person_id, kind, status, evidence_id, policy_id, policy_version, company_policies:policy_id(title, file_name, storage_path, source), people:person_id(full_name, profile_id)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!assignment || assignment.kind !== "policy" || !assignment.evidence_id) {
    return NextResponse.json({ error: "Nothing signed to show." }, { status: 404 });
  }

  const { data: evidence } = await supabase
    .from("evidence")
    .select("id, answers, submitted_at, author_id, author_name, company_id, record_type, record_id")
    .eq("id", assignment.evidence_id)
    .maybeSingle();
  // The signature must be on this person's own record (audit F44): a copy is never built from
  // Evidence filed somewhere else.
  if (!evidence || evidence.record_type !== "person" || evidence.record_id !== assignment.person_id) {
    return NextResponse.json({ error: "Nothing signed to show." }, { status: 404 });
  }

  const answers = (evidence.answers ?? {}) as Record<string, unknown>;
  const policy = (Array.isArray(assignment.company_policies)
    ? assignment.company_policies[0]
    : assignment.company_policies) as
    | { title: string; file_name: string; storage_path: string; source: string | null }
    | null;
  const person = (Array.isArray(assignment.people)
    ? assignment.people[0]
    : assignment.people) as { full_name: string; profile_id: string | null } | null;

  // Filed by a login other than the person's own (audit F44: possible before October 2026, not
  // since). Said on the page, so it never reads as their own signature. Seeded demo rows have no
  // author and a person with no login cannot be compared, so neither is marked.
  const recordedBy =
    evidence.author_id && person?.profile_id && evidence.author_id !== person.profile_id
      ? ((evidence.author_name as string | null) ?? "someone in the office")
      : null;

  const admin = createServiceClient();
  const signedVersion = Number(answers["policy_version"] ?? assignment.policy_version ?? 1);

  // The document AS SIGNED.
  //  - written policy: drawn from the WORDING frozen at that version, so a later
  //    layout fix reaches old copies while the words stay exactly as signed;
  //  - uploaded document: the file stored for that version, byte for byte.
  let original: Buffer | null = null;
  if (policy?.source === "text" && assignment.policy_id) {
    const rendered = await renderWrittenPolicy(assignment.policy_id as string, signedVersion);
    if (rendered.ok) original = rendered.pdf;
  } else {
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
    // Only from this assignment's own company folder, whatever the rows say (audit F1, 0443).
    if (documentPath && pathInCompany(documentPath, assignment.company_id)) {
      const dl = await admin.storage.from(EVIDENCE_BUCKET).download(documentPath);
      if (dl.data) original = Buffer.from(await dl.data.arrayBuffer());
    }
  }

  // The drawn signature lives in the private bucket as a PNG.
  let signaturePng: Buffer | null = null;
  const { data: sigFile } = await admin
    .from("evidence_files")
    .select("storage_path")
    .eq("evidence_id", evidence.id)
    .eq("kind", "signature")
    .maybeSingle();
  if (sigFile?.storage_path && pathInCompany(sigFile.storage_path, evidence.company_id)) {
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
    recordedBy,
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
    metadata: { evidence_id: evidence.id, version: signedVersion, recorded_by_someone_else: !!recordedBy },
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
