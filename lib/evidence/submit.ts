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
import { queueCloudCopy } from "@/lib/cloud/queue";
import {
  type Answers,
  type FormSchema,
  isFormSchema,
} from "@/lib/form-schema";
import { cleanAnswers, validateAnswers, type FieldError } from "@/lib/form-validate";
import type { LookupChoice } from "@/lib/forms/lookup";
import { choicesForSchema } from "@/lib/forms/lookup-data";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { computeScores } from "@/lib/forms/compute-scores";
import { deleteEvidenceObjects, evidenceFilePath, sha256Hex, uploadEvidenceObject } from "./storage";
import { attachmentProblem, storedContentType } from "./attachment-rules";
import { readActingCompanyId } from "@/lib/founder/manage-as";
import { SUPPORT_MODE_EVIDENCE_REFUSAL } from "@/lib/founder/support-mode";

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
  recordType?: "person" | "service_user" | "complaint" | "incident" | null;
  recordId?: string | null;
  /** Optional stable id for idempotent retries. */
  evidenceId?: string;
  /**
   * The records the form's record_lookup fields offered, when they came from somewhere other
   * than the caller's own view (the Incident Report reads them with the service role, because
   * a carer can see neither service users nor colleagues). Left out, the list is read here
   * through the caller's session, exactly as the Complete page built it.
   */
  lookupChoices?: Partial<Record<string, LookupChoice[]>>;
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
    supabase.from("profiles").select("full_name, email, role").eq("id", user.id).maybeSingle(),
  ]);
  if (fvErr || !fv || !fv.forms) {
    return { ok: false, error: "That form could not be found." };
  }
  /* EVIDENCE IS SIGNED BY THE COMPANY, NEVER BY SUPPORT MODE (DEF-006, kept by Phil on
     4 Oct 2026 in audit S4). The database already refuses it (submit_evidence asks for a
     company member, and the Founder is not one), but only at the very end, after files have
     gone to storage. Every Evidence path comes through here, so this is the one place that
     says no first, before anything is uploaded or written. */
  if (profile?.role === "platform_admin" && (await readActingCompanyId())) {
    return { ok: false, error: SUPPORT_MODE_EVIDENCE_REFUSAL };
  }
  if (!isFormSchema(fv.schema)) {
    return { ok: false, error: "This form has an invalid schema and cannot be completed." };
  }
  const schema = fv.schema as FormSchema;
  const companyId = fv.forms.company_id;

  /* 1b. WORK THE SCORES OUT AGAIN, HERE. A score_total or score_band arriving from the
     browser is a number that could have been edited on the way, and a score is exactly the
     part of an appraisal somebody has a reason to lean on. The same function the renderer
     uses is run again on the server, so what is stored is what the schema says it should
     be. Forms with no computed fields are handed straight back untouched. */
  const answers = computeScores(schema, input.answers);

  // 2. Authoritative validation. A record_lookup answer must be the name of a record this
  //    person could have picked (Phil, 2026-10-09), not whatever was typed.
  const hasLookup = schema.sections.some((sec) => sec.fields.some((f) => f.type === "record_lookup"));
  const lookupChoices = hasLookup
    ? input.lookupChoices ?? (await choicesForSchema(companyId, schema, { senior: profile?.role === "senior" }))
    : undefined;
  const result = validateAnswers(schema, answers, { lookupChoices: lookupChoices ?? (hasLookup ? {} : undefined) });
  if (!result.ok) {
    // NAMES the offending answers rather than saying "the highlighted fields". Every
    // caller of this function turns the failure into a single line of copy, and a page
    // does not always render the field that failed (a hidden, pre-supplied answer, or a
    // page built from a trimmed copy of the schema), so "highlighted" can point at
    // nothing at all. See describeValidationErrors.
    return { ok: false, error: describeValidationErrors(schema, result.errors), errors: result.errors };
  }

  // 3. Strip hidden/presentational answers.
  const cleaned = cleanAnswers(schema, answers);

  const evidenceId = input.evidenceId ?? randomUUID();

  // 4. Upload files / signatures.
  /* WHAT IS TAKEN, CHECKED FIRST (audit S10). Every file is judged before any is stored: a
     picture, PDF, Office file or plain text, named for what it is, under the size cap. */
  for (const file of input.files ?? []) {
    const problem = attachmentProblem({ fileName: file.fileName, contentType: file.contentType, size: file.bytes.length, kind: file.kind });
    if (problem) return { ok: false, error: problem };
  }
  const fileRecords: Array<Record<string, unknown>> = [];
  const uploaded: string[] = [];
  for (const file of input.files ?? []) {
    const path = evidenceFilePath(companyId, evidenceId, file.fieldKey, file.fileName);
    const contentType = storedContentType(file);
    const up = await uploadEvidenceObject(path, file.bytes, contentType);
    if (!up.ok) {
      await deleteEvidenceObjects(uploaded);
      return { ok: false, error: `Could not store an attachment: ${up.error}` };
    }
    uploaded.push(path);
    fileRecords.push({
      field_key: file.fieldKey,
      kind: file.kind,
      storage_path: path,
      file_name: file.fileName,
      mime_type: contentType,
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
    /* A REFUSED SAVE LEAVES NOTHING BEHIND (audit S10): the files went up first so the row could
       name them, so take them back out when the row is refused. */
    await deleteEvidenceObjects(uploaded);
    return { ok: false, error: rpcErr.message };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile?.email ?? user.email ?? null,
    actorRole: (profile as { role?: string } | null)?.role ?? "unknown",
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

  // A copy in the company's own cloud drive, when they have connected one (0437). Never throws,
  // never slows the save: the copy runs after the response.
  await queueCloudCopy({ companyId, kind: "evidence", sourceId: evidenceId });
  for (const f of fileRecords) {
    if (f.kind === "upload") {
      await queueCloudCopy({ companyId, kind: "evidence_file", sourceId: `${evidenceId}|${String(f.storage_path)}` });
    }
  }

  return { ok: true, evidenceId };
}
