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
 *
 * ITEM 18, 2026-08-11: for a year this module held the rule and NOTHING CALLED ANY OF IT.
 * Every evidence row had retention_until null and nothing had ever been anonymised, so
 * evidence was kept for ever. It is wired up now:
 *
 *   setting the clock   applyRetentionForRecord, called the moment a Person is marked a
 *                       leaver or a Service User is discharged (and it CLEARS the date
 *                       again if that status is undone, so a returning employee's records
 *                       do not keep counting down from a stale leaving date);
 *   running the rule    runRetentionExpiry, called only by the daily retention cron, which
 *                       anonymises what is genuinely past its date, skips anything on a
 *                       retention hold, purges the storage objects and audits every row.
 *
 * Nothing here deletes an evidence ROW. Anonymising empties the answers, the author and the
 * files and stamps anonymised_at: the fact that a check was completed, when, and against
 * which form version survives, because that is the compliance history. The personal data
 * inside it does not.
 */

import { createClient } from "@/lib/supabase/server";
import { addYearsIso } from "@/lib/dates";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { deleteEvidenceObjects, evidenceRenderPath } from "./storage";

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
}): Promise<{ updated: number; error?: string }> {
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
  if (error) return { updated: 0, error: error.message };
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
    // The cached RENDER of this evidence is a full PDF of it, personal data and all. Erasing
    // the row and leaving that behind would be erasure in name only.
    ...(ev?.company_id ? [evidenceRenderPath(ev.company_id, input.evidenceId)] : []),
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

/**
 * Set or CLEAR retention_until for every evidence row on one record, called whenever that
 * record's end of care changes.
 *
 * Both directions matter. A Person marked a leaver starts the eight year clock; the same
 * Person put back to Active (they came back, or somebody clicked the wrong pill) must have
 * the clock STOPPED, or their evidence would sit with a date derived from a leaving that no
 * longer happened and would one day be anonymised while they still work there.
 *
 * Uses the service role: `evidence` has no end-user UPDATE policy, deliberately, because it
 * is append only. Never throws, and returns the count so callers can log it.
 */
export async function applyRetentionForRecord(input: {
  companyId: string;
  recordType: "person" | "service_user";
  recordId: string;
  /** The end of care date (leaver / discharge) as ISO yyyy-mm-dd, or null when the record
   *  is live again. A STRING, not a Date: a civil date turned into a Date in one timezone
   *  and read back in another can slide a day, and this day decides when records go. */
  endOfCare: string | null;
  minYears?: number;
  // The error is RETURNED, not swallowed. A retention clock that silently fails to start, or
  // silently fails to stop, is the exact failure this whole item exists to remove; the
  // callers put it in the audit row so it is visible after the fact.
}): Promise<{ updated: number; error?: string }> {
  const supabase = createServiceClient();
  const minYears = input.minYears ?? DEFAULT_RETENTION_MIN_YEARS;

  // Cleared, not left behind: see the note above about a leaver who returns.
  if (!input.endOfCare) {
    // ONLY retention_until is cleared. retention_min_years is NOT NULL with a default of 8
    // (it is the policy, not a fact about this record), and the first version of this tried
    // to null it: every clear was rejected by the database, the error was swallowed here,
    // and a returning employee's records silently kept counting down. Found live 2026-08-11
    // by checking the rows after the screen said "Saved".
    const { data, error } = await supabase
      .from("evidence")
      .update({ retention_until: null })
      .eq("company_id", input.companyId)
      .eq("record_type", input.recordType)
      .eq("record_id", input.recordId)
      .is("anonymised_at", null)
      .select("id");
    if (error) return { updated: 0, error: error.message };
    return { updated: data?.length ?? 0 };
  }

  const until = addYearsIso(input.endOfCare, minYears);
  // An unparseable end of care leaves the clock unset rather than guessing a date: no
  // retention date at all is safe (nothing expires), a wrong one destroys records early.
  if (!until) return { updated: 0 };
  // Overwrites an existing date on purpose (unlike backfillRetentionForRecord, which only
  // fills a null): if the leaving date is corrected, the clock must move with it.
  const { data, error } = await supabase
    .from("evidence")
    .update({
      retention_until: until,
      retention_basis: "end_of_care",
      retention_min_years: minYears,
    })
    .eq("company_id", input.companyId)
    .eq("record_type", input.recordType)
    .eq("record_id", input.recordId)
    .is("anonymised_at", null)
    .select("id");
  if (error) return { updated: 0 };
  return { updated: data?.length ?? 0 };
}

export type RetentionExpiryResult = {
  anonymised: number;
  objectsRemoved: number;
  companies: number;
  /** True when the run filled its batch, so more is probably waiting for tomorrow. */
  batchFull?: boolean;
  error?: string;
};

/**
 * THE ONLY scheduled path that destroys personal data. Called by /api/cron/retention.
 *
 * The selection, the hold check and the anonymisation all happen inside
 * expire_evidence_retention (migration 0171), in one statement, so nothing here can pick a
 * different set of rows than the ones that get emptied. That function is service role only:
 * a browser cannot reach it, whatever it sends.
 *
 * Order is deliberate: the database row is anonymised FIRST and the storage objects are
 * removed after. If the object removal fails, the record is already anonymised and the file
 * is orphaned in a private bucket, which is recoverable. The other order would leave a
 * record claiming to hold evidence whose file had already gone.
 */
export async function runRetentionExpiry(options?: { limit?: number }): Promise<RetentionExpiryResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("expire_evidence_retention", {
    p_limit: options?.limit ?? 200,
  });
  if (error) {
    return { anonymised: 0, objectsRemoved: 0, companies: 0, error: error.message };
  }

  const rows = (data ?? []) as {
    evidence_id: string;
    company_id: string;
    purged_path: string | null;
  }[];
  const byEvidence = new Map<string, { companyId: string; paths: string[] }>();
  for (const row of rows) {
    const entry = byEvidence.get(row.evidence_id) ?? { companyId: row.company_id, paths: [] };
    if (row.purged_path) entry.paths.push(row.purged_path);
    byEvidence.set(row.evidence_id, entry);
  }

  // Every anonymised evidence also gets its cached RENDER removed. That object is a whole
  // PDF of the record and it is NOT in evidence_files, so nothing in the database points at
  // it: it has to be named from the convention or it is left behind for ever. Removing a
  // path that was never rendered is a harmless no-op.
  for (const [evidenceId, entry] of byEvidence) {
    entry.paths.push(evidenceRenderPath(entry.companyId, evidenceId));
  }

  const allPaths = [...byEvidence.values()].flatMap((v) => v.paths);
  await deleteEvidenceObjects(allPaths);

  const companies = new Set<string>();
  for (const [evidenceId, entry] of byEvidence) {
    companies.add(entry.companyId);
    await writeAudit({
      companyId: entry.companyId,
      actorId: null,
      actorEmail: null,
      actorRole: "retention",
      action: "evidence.anonymised",
      entityType: "evidence",
      entityId: evidenceId,
      summary: "Anonymised by the retention rule (past its retention date)",
      metadata: { objects_removed: entry.paths.length, reason: "retention_expiry" },
    });
  }

  // NO SILENT CAPS. A full batch means there is probably more waiting, and tomorrow's run
  // will take the next batch. Saying so is the difference between "nothing left to do" and
  // "we stopped counting". Not treated as an error, because it is not one.
  const limit = options?.limit ?? 200;
  return {
    anonymised: byEvidence.size,
    objectsRemoved: allPaths.length,
    companies: companies.size,
    batchFull: byEvidence.size >= limit,
  };
}
