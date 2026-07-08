import "server-only";

/**
 * Be Care Compliant — evidence retention, anonymisation and SAR groundwork
 * (Phase 2). Evidence is our most sensitive store (special-category health and
 * social care data under UK GDPR), so retention and erasure are designed in from
 * the start. The heavy wiring (scheduled expiry, SAR export UI) lands later;
 * this module provides the correct primitives.
 *
 * Retention basis: minimum 8 years from a record's end of care, aligning with
 * the IGA / NHS Records Management Code for adult social care records. The clock
 * starts when a record ends (a leaver or a discharged service user), which is
 * why retention_until is null until then and backfilled from Phase 3/4.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { deleteEvidenceObjects } from "./storage";

export const DEFAULT_RETENTION_MIN_YEARS = 8;

/** Compute the earliest date evidence may be anonymised: end of care + N years. */
export function computeRetentionUntil(
  recordEndOfCare: Date,
  minYears: number = DEFAULT_RETENTION_MIN_YEARS,
): Date {
  const d = new Date(recordEndOfCare);
  d.setFullYear(d.getFullYear() + minYears);
  return d;
}

/**
 * Backfill retention_until for all evidence belonging to a record once its end
 * of care is known (called from Phase 3/4 when a person leaves or a service user
 * is discharged). Uses the service role (a controlled path; evidence has no
 * end-user UPDATE policy) and only sets it where not already set.
 */
export async function backfillRetentionForRecord(input: {
  companyId: string;
  recordType: "person" | "service_user";
  recordId: string;
  endOfCare: Date;
  minYears?: number;
}): Promise<{ updated: number }> {
  const until = computeRetentionUntil(input.endOfCare, input.minYears ?? DEFAULT_RETENTION_MIN_YEARS);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("evidence")
    .update({ retention_until: until.toISOString().slice(0, 10) })
    .eq("company_id", input.companyId)
    .eq("record_type", input.recordType)
    .eq("record_id", input.recordId)
    .is("retention_until", null)
    .select("id");
  if (error) return { updated: 0 };
  return { updated: data?.length ?? 0 };
}

/**
 * Anonymise a single evidence row (SAR erasure or retention expiry). Collects
 * the storage paths first (the RPC nulls them), invokes the admin-guarded
 * anonymise_evidence RPC, then removes the objects from the private bucket.
 */
export async function anonymiseEvidence(input: {
  evidenceId: string;
  actor: { id: string; email: string; role: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // 1. Gather the paths to purge before the RPC clears them.
  const { data: ev } = await supabase
    .from("evidence")
    .select("company_id, pdf_path")
    .eq("id", input.evidenceId)
    .maybeSingle();
  const { data: files } = await supabase
    .from("evidence_files")
    .select("storage_path")
    .eq("evidence_id", input.evidenceId);

  const paths = [
    ...(ev?.pdf_path ? [ev.pdf_path] : []),
    ...((files ?? []).map((f) => f.storage_path).filter((p): p is string => !!p)),
  ];

  // 2. Anonymise the row(s) via the guarded RPC (runs with the caller's auth).
  const { error } = await supabase.rpc("anonymise_evidence", { p_evidence_id: input.evidenceId });
  if (error) return { ok: false, error: error.message };

  // 3. Purge the storage objects (service role).
  await deleteEvidenceObjects(paths);

  await writeAudit({
    companyId: ev?.company_id ?? null,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: "evidence.anonymised",
    entityType: "evidence",
    entityId: input.evidenceId,
    summary: "Anonymised evidence (SAR erasure or retention expiry)",
    metadata: { objects_removed: paths.length },
  });

  return { ok: true };
}

/**
 * SAR groundwork: gather all evidence for one data subject (a Person or Service
 * User record) for a subject access request export. Admin/Platform only (guarded
 * in the RPC). Returns the evidence rows; the export packaging lands in Phase 8.
 */
export async function sarEvidenceForSubject(input: {
  companyId: string;
  recordType: "person" | "service_user";
  recordId: string;
}): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sar_evidence_for_subject", {
    cid: input.companyId,
    p_record_type: input.recordType,
    p_record_id: input.recordId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data ?? [] };
}
