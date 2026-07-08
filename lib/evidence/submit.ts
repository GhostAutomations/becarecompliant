import "server-only";

/**
 * Be Care Compliant — evidence submission pipeline (Phase 2).
 *
 * The single shared entry point for turning a completed Form into immutable
 * evidence. Phase 3 (People) and Phase 4 (Service Users) call this; there is no
 * submission UI yet. Order matters for append-only integrity:
 *
 *   1. Load and pin the exact form version (schema, name, company, branch).
 *   2. Validate answers authoritatively (never trust the client).
 *   3. Strip answers for hidden/presentational fields.
 *   4. Upload any files / signatures to the private bucket.
 *   5. Render the branded PDF and upload it.
 *   6. Insert the evidence row in ONE shot via submit_evidence, with the PDF
 *      path + SHA-256 already set, so nothing is ever updated after creation.
 *
 * Idempotent: pass a stable `evidenceId` for retries; a duplicate primary key is
 * treated as "already submitted" rather than a second evidence row.
 */

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  type Answers,
  type FormSchema,
  isFormSchema,
} from "@/lib/form-schema";
import { cleanAnswers, validateAnswers, type FieldError } from "@/lib/form-validate";
import { renderEvidencePdf, type EvidencePdfMeta } from "./pdf";
import {
  evidenceFilePath,
  evidencePdfPath,
  sha256Hex,
  uploadEvidenceObject,
} from "./storage";

export type EvidenceFileInput = {
  fieldKey: string;
  kind: "upload" | "signature";
  fileName: string;
  contentType: string;
  bytes: Buffer;
};

export type SubmitEvidenceInput = {
  formVersionId: string;
  branchId: string | null;
  answers: Answers;
  files?: EvidenceFileInput[];
  recordType?: "person" | "service_user" | null;
  recordId?: string | null;
  /** Optional stable id for idempotent retries. */
  evidenceId?: string;
};

export type SubmitEvidenceResult =
  | { ok: true; evidenceId: string; duplicate?: boolean }
  | { ok: false; error: string; errors?: FieldError[] };

type FormVersionRow = {
  id: string;
  version: number;
  schema: unknown;
  forms: {
    name: string;
    company_id: string;
    companies: { name: string } | null;
  } | null;
};

export async function submitEvidence(input: SubmitEvidenceInput): Promise<SubmitEvidenceResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // 1. Load + pin the exact form version.
  const { data: fv, error: fvErr } = await supabase
    .from("form_versions")
    .select("id, version, schema, forms(name, company_id, companies(name))")
    .eq("id", input.formVersionId)
    .single<FormVersionRow>();
  if (fvErr || !fv || !fv.forms) {
    return { ok: false, error: "That form could not be found." };
  }
  if (!isFormSchema(fv.schema)) {
    return { ok: false, error: "This form has an invalid schema and cannot be completed." };
  }
  const schema = fv.schema as FormSchema;
  const companyId = fv.forms.company_id;
  const companyName = fv.forms.companies?.name ?? "Company";

  let branchName: string | null = null;
  if (input.branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", input.branchId)
      .maybeSingle();
    branchName = branch?.name ?? null;
  }

  // 2. Authoritative validation.
  const result = validateAnswers(schema, input.answers);
  if (!result.ok) {
    return { ok: false, error: "Please correct the highlighted fields.", errors: result.errors };
  }

  // 3. Strip hidden/presentational answers.
  const cleaned = cleanAnswers(schema, input.answers);

  const evidenceId = input.evidenceId ?? randomUUID();

  // Author details for the PDF header + denormalised storage.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  // 4. Upload files / signatures.
  const fileRecords: Array<Record<string, unknown>> = [];
  for (const file of input.files ?? []) {
    const path = evidenceFilePath(companyId, evidenceId, file.fieldKey, file.fileName);
    const up = await uploadEvidenceObject(path, file.bytes, file.contentType);
    if (!up.ok) return { ok: false, error: `Could not store an attachment: ${up.error}` };
    fileRecords.push({
      field_key: file.fieldKey,
      kind: file.kind,
      storage_path: path,
      file_name: file.fileName,
      mime_type: file.contentType,
      bytes: file.bytes.length,
      sha256: sha256Hex(file.bytes),
    });
  }

  // 5. Render + upload the branded PDF.
  const submittedAt = new Date();
  const meta: EvidencePdfMeta = {
    companyName,
    branchName,
    formName: fv.forms.name,
    formVersion: fv.version,
    authorName: profile?.full_name || null,
    authorEmail: profile?.email || user.email || null,
    submittedAt,
    evidenceRef: evidenceId.slice(0, 8).toUpperCase(),
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderEvidencePdf(schema, cleaned, meta);
  } catch (e) {
    return { ok: false, error: `Could not generate the evidence PDF: ${(e as Error).message}` };
  }
  const pdfPath = evidencePdfPath(companyId, evidenceId);
  const pdfUpload = await uploadEvidenceObject(pdfPath, pdfBuffer, "application/pdf");
  if (!pdfUpload.ok) {
    return { ok: false, error: `Could not store the evidence PDF: ${pdfUpload.error}` };
  }

  // 6. Insert the append-only evidence row in one shot.
  const { error: rpcErr } = await supabase.rpc("submit_evidence", {
    p_evidence_id: evidenceId,
    p_form_version_id: input.formVersionId,
    p_branch_id: input.branchId,
    p_answers: cleaned,
    p_pdf_path: pdfPath,
    p_pdf_sha256: sha256Hex(pdfBuffer),
    p_pdf_bytes: pdfBuffer.length,
    p_record_type: input.recordType ?? null,
    p_record_id: input.recordId ?? null,
    p_files: fileRecords,
  });

  if (rpcErr) {
    // Idempotent retry: same evidenceId already inserted.
    if (rpcErr.code === "23505") {
      return { ok: true, evidenceId, duplicate: true };
    }
    return { ok: false, error: rpcErr.message };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile?.email ?? user.email ?? null,
    actorRole: "unknown",
    action: "evidence.created",
    entityType: "evidence",
    entityId: evidenceId,
    summary: `Completed ${fv.forms.name} (version ${fv.version})`,
    metadata: {
      form_version_id: input.formVersionId,
      branch_id: input.branchId,
      record_type: input.recordType ?? null,
      record_id: input.recordId ?? null,
      files: fileRecords.length,
    },
  });

  return { ok: true, evidenceId };
}
