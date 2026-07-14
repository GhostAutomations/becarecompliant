import "server-only";

/**
 * Be Care Compliant — on demand Evidence PDF (Phase 8).
 *
 * Evidence is stored as an immutable snapshot (answers + frozen schema_snapshot +
 * pinned form version). The branded PDF is NOT stored at save time for new rows;
 * because the snapshot is frozen and renderEvidencePdf is deterministic, the PDF
 * is regenerated identically here whenever an inspector copy is needed.
 *
 * Flow, security enforced at every step:
 *   1. Read the evidence row through the CALLER's RLS client, so a user can only
 *      obtain a PDF for evidence they are allowed to see (record and role scoped).
 *   2. Render (or reuse a legacy stored PDF), upload to a render path in the
 *      PRIVATE bucket with the service role, and hand back a 5 minute signed URL.
 *   3. signEvidenceDownload writes the evidence.downloaded audit row (GDPR read
 *      audit for special-category data). The immutable evidence row is never
 *      rewritten: this is a render, not a re-store.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isFormSchema, type Answers, type FormSchema } from "@/lib/form-schema";
import { renderEvidencePdf, type EvidencePdfMeta } from "@/lib/evidence/pdf";
import { EVIDENCE_BUCKET, signEvidenceDownload } from "@/lib/evidence/storage";
import { writeAudit } from "@/lib/audit";

export type EvidenceActor = { id: string; email: string; role: string };

export type EvidenceFileRef = { fileName: string; kind: string };

export type EvidenceView = {
  id: string;
  formName: string;
  formVersion: number;
  authorName: string | null;
  submittedAt: string;
  companyName: string;
  branchName: string | null;
  recordType: "person" | "service_user";
  recordId: string;
  schema: FormSchema;
  answers: Answers;
  /** Uploaded files / signatures, keyed by field key, for signed download links. */
  files: Record<string, EvidenceFileRef>;
};

type EvidenceViewRow = EvidenceRow & {
  record_type: "person" | "service_user";
  record_id: string;
};

/**
 * Load one Evidence for the on screen viewer, authorised by the caller's RLS read,
 * and write the GDPR read audit (evidence.viewed) for special-category data. The
 * frozen snapshot is rendered read only in the UI; the PDF is a separate download.
 */
export async function getEvidenceView(
  evidenceId: string,
  actor: EvidenceActor,
): Promise<{ ok: true; data: EvidenceView } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence")
    .select(
      "id, company_id, branch_id, record_type, record_id, schema_snapshot, answers, author_name, author_email, submitted_at, pdf_path, companies(name), branches(name), form_versions(version), forms(name)",
    )
    .eq("id", evidenceId)
    .maybeSingle<EvidenceViewRow>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That evidence could not be found, or you cannot access it." };
  if (!isFormSchema(data.schema_snapshot)) {
    return { ok: false, error: "This evidence has an invalid snapshot and cannot be shown." };
  }

  // Uploaded files / signatures (same RLS as the parent row). Keyed by field for
  // the read-only view to offer signed download links.
  const { data: filesRaw } = await supabase
    .from("evidence_files")
    .select("field_key, file_name, storage_path, kind")
    .eq("evidence_id", data.id);
  const files: Record<string, EvidenceFileRef> = {};
  for (const f of (filesRaw as { field_key: string; file_name: string | null; storage_path: string | null; kind: string }[] | null) ?? []) {
    if (f.storage_path) files[f.field_key] = { fileName: f.file_name ?? "file", kind: f.kind };
  }

  await writeAudit({
    companyId: data.company_id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "evidence.viewed",
    entityType: "evidence",
    entityId: data.id,
    summary: "Viewed evidence on screen",
    metadata: {},
  });

  return {
    ok: true,
    data: {
      id: data.id,
      formName: data.forms?.name ?? "Form",
      formVersion: data.form_versions?.version ?? 1,
      authorName: data.author_name,
      submittedAt: data.submitted_at,
      companyName: data.companies?.name ?? "Company",
      branchName: data.branches?.name ?? null,
      recordType: data.record_type,
      recordId: data.record_id,
      schema: data.schema_snapshot as FormSchema,
      answers: (data.answers ?? {}) as Answers,
      files,
    },
  };
}

type EvidenceRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  schema_snapshot: unknown;
  answers: Answers;
  author_name: string | null;
  author_email: string | null;
  submitted_at: string;
  pdf_path: string | null;
  companies: { name: string } | null;
  branches: { name: string } | null;
  form_versions: { version: number } | null;
  forms: { name: string } | null;
};

/** Render path kept separate from the canonical evidence.pdf so a legacy stored
 * PDF is never overwritten and the immutable row's pdf_path is never touched. */
function evidenceRenderPath(companyId: string, evidenceId: string): string {
  return `${companyId}/${evidenceId}/render/evidence.pdf`;
}

function shortRef(evidenceId: string): string {
  return evidenceId.slice(0, 8).toUpperCase();
}

/**
 * Return a 5 minute signed URL to the branded PDF for one Evidence, rendering it
 * on demand from the frozen snapshot, and audit the download. Authorises via the
 * caller's RLS read first.
 */
export async function evidenceSignedPdfUrl(input: {
  evidenceId: string;
  actor: EvidenceActor;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence")
    .select(
      "id, company_id, branch_id, schema_snapshot, answers, author_name, author_email, submitted_at, pdf_path, companies(name), branches(name), form_versions(version), forms(name)",
    )
    .eq("id", input.evidenceId)
    .maybeSingle<EvidenceRow>();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That evidence could not be found, or you cannot access it." };

  // Legacy rows carry a stored PDF: sign it directly (still audited).
  if (data.pdf_path) {
    return signEvidenceDownload({
      companyId: data.company_id,
      evidenceId: data.id,
      path: data.pdf_path,
      label: "PDF",
      actor: input.actor,
    });
  }

  if (!isFormSchema(data.schema_snapshot)) {
    return { ok: false, error: "This evidence has an invalid snapshot and cannot be rendered." };
  }

  const meta: EvidencePdfMeta = {
    companyName: data.companies?.name ?? "Company",
    branchName: data.branches?.name ?? null,
    formName: data.forms?.name ?? "Form",
    formVersion: data.form_versions?.version ?? 1,
    authorName: data.author_name,
    authorEmail: data.author_email,
    submittedAt: new Date(data.submitted_at),
    evidenceRef: shortRef(data.id),
  };

  let bytes: Buffer;
  try {
    bytes = await renderEvidencePdf(data.schema_snapshot as FormSchema, data.answers ?? {}, meta);
  } catch (e) {
    return { ok: false, error: `The evidence PDF could not be generated: ${(e as Error).message}` };
  }

  // Upload the freshly rendered copy to the render path (deterministic, so upsert
  // is safe) and sign it. The immutable evidence row is left untouched.
  const admin = createServiceClient();
  const path = evidenceRenderPath(data.company_id, data.id);
  const { error: upErr } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: `Could not store the rendered PDF: ${upErr.message}` };

  return signEvidenceDownload({
    companyId: data.company_id,
    evidenceId: data.id,
    path,
    label: "PDF",
    actor: input.actor,
  });
}

/** In-memory render of one Evidence PDF, for bundling into an Evidence pack.
 * Authorises via the caller's RLS read. Does not upload or sign. */
export async function renderEvidenceBytes(
  evidenceId: string,
): Promise<{ ok: true; bytes: Buffer; ref: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence")
    .select(
      "id, company_id, branch_id, schema_snapshot, answers, author_name, author_email, submitted_at, pdf_path, companies(name), branches(name), form_versions(version), forms(name)",
    )
    .eq("id", evidenceId)
    .maybeSingle<EvidenceRow>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Evidence not found." };
  if (!isFormSchema(data.schema_snapshot)) {
    return { ok: false, error: "Invalid evidence snapshot." };
  }
  const meta: EvidencePdfMeta = {
    companyName: data.companies?.name ?? "Company",
    branchName: data.branches?.name ?? null,
    formName: data.forms?.name ?? "Form",
    formVersion: data.form_versions?.version ?? 1,
    authorName: data.author_name,
    authorEmail: data.author_email,
    submittedAt: new Date(data.submitted_at),
    evidenceRef: shortRef(data.id),
  };
  const bytes = await renderEvidencePdf(data.schema_snapshot as FormSchema, data.answers ?? {}, meta);
  return { ok: true, bytes, ref: shortRef(data.id) };
}
