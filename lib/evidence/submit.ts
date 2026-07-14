import "server-only";

/**
 * Be Care Compliant — evidence submission pipeline (Phase 2).
 *
 * The single shared entry point for turning a completed Form into immutable
 * evidence. Phase 3 (People) and Phase 4 (Service Users) call this; there is no
 * submission UI yet. Order matters for append-only integrity:
 *
 *   1. Load and pin the exact form version (schema, name, company).
 *   2. Validate answers authoritatively (never trust the client).
 *   3. Strip answers for hidden/presentational fields.
 *   4. Upload any files / signatures to the private bucket.
 *   5. Insert the evidence row (append-only) with the immutable answers + schema
 *      snapshot. The branded inspector PDF is NOT rendered here: because the
 *      snapshot is frozen and the render is deterministic, the PDF is generated on
 *      demand at export time (Phase 8). This keeps saving fast.
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
import { evidenceFilePath, sha256Hex, uploadEvidenceObject } from "./storage";

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
  recordType?: "person" | "service_user" | "complaint" | null;
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
  } | null;
};

export async function submitEvidence(input: SubmitEvidenceInput): Promise<SubmitEvidenceResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // 1. Load + pin the form version and the author profile in parallel.
  const [{ data: fv, error: fvErr }, { data: profile }] = await Promise.all([
    supabase
      .from("form_versions")
      .select("id, version, schema, forms(name, company_id)")
      .eq("id", input.formVersionId)
      .single<FormVersionRow>(),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);
  if (fvErr || !fv || !fv.forms) {
    return { ok: false, error: "That form could not be found." };
  }
  if (!isFormSchema(fv.schema)) {
    return { ok: false, error: "This form has an invalid schema and cannot be completed." };
  }
  const schema = fv.schema as FormSchema;
  const companyId = fv.forms.company_id;

  // 2. Authoritative validation.
  const result = validateAnswers(schema, input.answers);
  if (!result.ok) {
    return { ok: false, error: "Please correct the highlighted fields.", errors: result.errors };
  }

  // 3. Strip hidden/presentational answers.
  const cleaned = cleanAnswers(schema, input.answers);

  const evidenceId = input.evidenceId ?? randomUUID();

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

  // 5. Insert the append-only evidence row. The branded PDF is generated on demand
  // at export time (Phase 8) from the frozen snapshot, so it is not rendered here.
  const { error: rpcErr } = await supabase.rpc("submit_evidence", {
    p_evidence_id: evidenceId,
    p_form_version_id: input.formVersionId,
    p_branch_id: input.branchId,
    p_answers: cleaned,
    p_pdf_path: null,
    p_pdf_sha256: null,
    p_pdf_bytes: null,
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
