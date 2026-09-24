import "server-only";

/**
 * Be Care Compliant — attachments of Updates that nothing points at any more (0324).
 *
 * Two ways a file can be left in the private record-updates bucket with no row:
 *   1. An upload started and never posted (the tab was closed half way). Every such upload is in
 *      record_update_uploads_pending, and posting deletes its row, so what is still there a day
 *      later was abandoned.
 *   2. The record was deleted, which cascades its updates and their file rows. A trigger puts
 *      each file's path in record_update_file_trash as its row goes.
 * The nightly retention run calls this to remove both. Nothing is removed that still has a row.
 */

import { createServiceClient } from "@/lib/supabase/admin";

const BUCKET = "record-updates";

export async function removeRecordUpdateLeftovers(): Promise<{ removed: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let removed = 0;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: pendErr } = await supabase
    .from("record_update_uploads_pending")
    .select("update_id, company_id")
    .lt("created_at", cutoff)
    .limit(200);
  if (pendErr) errors.push(`pending: ${pendErr.message}`);
  for (const row of (pending as Array<{ update_id: string; company_id: string }>) ?? []) {
    const { data: posted } = await supabase.from("record_updates").select("id").eq("id", row.update_id).maybeSingle();
    if (!posted) {
      const folder = `${row.company_id}/${row.update_id}`;
      const { data: objects, error: listErr } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
      if (listErr) {
        errors.push(`${row.update_id}: ${listErr.message}`);
        continue;
      }
      const paths = ((objects as Array<{ name: string }>) ?? []).map((o) => `${folder}/${o.name}`);
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
        if (rmErr) {
          errors.push(`${row.update_id}: ${rmErr.message}`);
          continue;
        }
        removed += paths.length;
      }
    }
    await supabase.from("record_update_uploads_pending").delete().eq("update_id", row.update_id);
  }

  const { data: trash, error: trashErr } = await supabase
    .from("record_update_file_trash")
    .select("storage_path")
    .order("queued_at", { ascending: true })
    .limit(500);
  if (trashErr) errors.push(`trash: ${trashErr.message}`);
  const paths = ((trash as Array<{ storage_path: string }>) ?? []).map((t) => t.storage_path);
  // Belt and braces: never remove a file that has a row again.
  const { data: live } = paths.length
    ? await supabase.from("record_update_files").select("storage_path").in("storage_path", paths)
    : { data: [] };
  const keep = new Set(((live as Array<{ storage_path: string }>) ?? []).map((l) => l.storage_path));
  const gone = paths.filter((p) => !keep.has(p));
  if (gone.length > 0) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(gone);
    if (rmErr) errors.push(`trash: ${rmErr.message}`);
    else removed += gone.length;
  }
  if (paths.length > 0 && errors.length === 0) {
    await supabase.from("record_update_file_trash").delete().in("storage_path", paths);
  }
  return { removed, errors };
}
