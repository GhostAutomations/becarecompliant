import "server-only";

/**
 * Be Care Compliant — subject access exports are removed a day after they are made (0326). The ZIP
 * is a complete copy of everything held about somebody; it exists to be downloaded once, not to sit
 * in a bucket. The nightly retention run calls this. The row stays (who made one, for whom, when),
 * with removed_at stamped, so the record of the request survives the file.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export const SAR_BUCKET = "subject-access";

export async function removeOldSubjectAccessExports(): Promise<{ removed: number; errors: string[] }> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("sar_exports")
    .select("id, storage_path")
    .is("removed_at", null)
    .lt("created_at", cutoff)
    .limit(200);
  if (error) return { removed: 0, errors: [error.message] };
  const rows = (data ?? []) as Array<{ id: string; storage_path: string | null }>;
  if (rows.length === 0) return { removed: 0, errors: [] };
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(SAR_BUCKET).remove(paths);
    if (rmErr) return { removed: 0, errors: [rmErr.message] };
  }
  await supabase
    .from("sar_exports")
    .update({ removed_at: new Date().toISOString(), storage_path: null })
    .in("id", rows.map((r) => r.id));
  return { removed: rows.length, errors: [] };
}
