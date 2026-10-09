import "server-only";

/**
 * Be Care Compliant — Documents' files that nothing points at any more, and retention (0439).
 *
 * Files can be left in the private record-documents bucket with no live row in three ways:
 *   1. An upload started and never saved (the tab was closed half way). Every upload is in
 *      record_document_uploads_pending until it is saved, so what is still there a day later was
 *      abandoned.
 *   2. A Company Admin removed the document and the immediate delete failed: its path was queued.
 *   3. The record was deleted, or retention erased its documents: a trigger queued each path.
 * The nightly retention run removes all three. Nothing is removed that still has a live row.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

const BUCKET = "record-documents";

export async function removeRecordDocumentLeftovers(): Promise<{ removed: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let removed = 0;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: pendErr } = await supabase
    .from("record_document_uploads_pending")
    .select("batch_id, company_id")
    .lt("created_at", cutoff)
    .limit(200);
  if (pendErr) errors.push(`pending: ${pendErr.message}`);
  for (const row of (pending as Array<{ batch_id: string; company_id: string }>) ?? []) {
    const { data: saved } = await supabase.from("record_documents").select("id").eq("batch_id", row.batch_id).limit(1);
    if (!saved || saved.length === 0) {
      const folder = `${row.company_id}/${row.batch_id}`;
      const { data: objects, error: listErr } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
      if (listErr) {
        errors.push(`${row.batch_id}: ${listErr.message}`);
        continue;
      }
      const paths = ((objects as Array<{ name: string }>) ?? []).map((o) => `${folder}/${o.name}`);
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
        if (rmErr) {
          errors.push(`${row.batch_id}: ${rmErr.message}`);
          continue;
        }
        removed += paths.length;
      }
    }
    await supabase.from("record_document_uploads_pending").delete().eq("batch_id", row.batch_id);
  }

  const { data: trash, error: trashErr } = await supabase
    .from("record_document_file_trash")
    .select("storage_path")
    .order("queued_at", { ascending: true })
    .limit(500);
  if (trashErr) errors.push(`trash: ${trashErr.message}`);
  const paths = ((trash as Array<{ storage_path: string }>) ?? []).map((t) => t.storage_path);
  // Belt and braces: never remove the file of a document that is still there (not removed).
  const { data: live } = paths.length
    ? await supabase.from("record_documents").select("storage_path").in("storage_path", paths).is("removed_at", null)
    : { data: [] };
  const keep = new Set(((live as Array<{ storage_path: string }>) ?? []).map((l) => l.storage_path));
  const gone = paths.filter((p) => !keep.has(p));
  if (gone.length > 0) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(gone);
    if (rmErr) errors.push(`trash: ${rmErr.message}`);
    else removed += gone.length;
  }
  if (paths.length > 0 && errors.length === 0) {
    await supabase.from("record_document_file_trash").delete().in("storage_path", paths);
  }
  return { removed, errors };
}

/**
 * Documents past the record's retention date are erased, by the Updates rule (0325, 0439): eight
 * years from end of care, never while the record is on a retention hold. One audit line per record.
 * Run BEFORE removeRecordDocumentLeftovers, so the files of what was erased tonight go tonight.
 */
export async function expireRecordDocuments(options?: { limit?: number }): Promise<{ removed: number; records: number; error?: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("expire_record_document_retention", { p_limit: options?.limit ?? 200 });
  if (error) return { removed: 0, records: 0, error: error.message };
  const rows = (data ?? []) as Array<{ company_id: string; person_id: string | null; service_user_id: string | null; removed: number }>;
  let removed = 0;
  for (const r of rows) {
    removed += r.removed;
    await writeAudit({
      companyId: r.company_id,
      actorId: null,
      actorEmail: null,
      actorRole: "retention",
      action: "record_document.expired",
      entityType: r.person_id ? "person" : "service_user",
      entityId: r.person_id ?? r.service_user_id,
      summary: `Erased ${r.removed} ${r.removed === 1 ? "document" : "documents"} by the retention rule (eight years after end of care)`,
      metadata: { removed: r.removed, reason: "retention_expiry" },
    });
  }
  return { removed, records: rows.length };
}
