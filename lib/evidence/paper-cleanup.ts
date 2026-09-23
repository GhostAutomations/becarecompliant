import "server-only";

/**
 * Be Care Compliant — pages of a paper upload that were never filed (DEF-056).
 *
 * The pages of a paper upload go from the browser straight into the private evidence bucket,
 * before the Evidence row exists (see lib/evidence/paper-actions.ts for why). Somebody who closes
 * the tab half way leaves special category data in the bucket with nothing pointing at it. Every
 * upload that was started and not filed is in paper_upload_pending; the nightly retention run
 * calls this to remove what is still there a day later. Filing an upload deletes its row, so a
 * filed upload is never touched.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET } from "./storage";

export async function removeAbandonedPaperUploads(): Promise<{ removed: number; errors: string[] }> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("paper_upload_pending")
    .select("evidence_id, company_id")
    .lt("created_at", cutoff)
    .limit(200);
  if (error) return { removed: 0, errors: [error.message] };
  const errors: string[] = [];
  let removed = 0;
  for (const row of (data as Array<{ evidence_id: string; company_id: string }>) ?? []) {
    // Belt and braces: never remove the files of an upload that WAS filed.
    const { data: filed } = await supabase.from("evidence").select("id").eq("id", row.evidence_id).maybeSingle();
    if (!filed) {
      const folder = `${row.company_id}/${row.evidence_id}/files`;
      const { data: objects, error: listErr } = await supabase.storage.from(EVIDENCE_BUCKET).list(folder, { limit: 100 });
      if (listErr) {
        errors.push(`${row.evidence_id}: ${listErr.message}`);
        continue;
      }
      const paths = ((objects as Array<{ name: string }>) ?? []).map((o) => `${folder}/${o.name}`);
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
        if (rmErr) {
          errors.push(`${row.evidence_id}: ${rmErr.message}`);
          continue;
        }
        removed += paths.length;
      }
    }
    await supabase.from("paper_upload_pending").delete().eq("evidence_id", row.evidence_id);
  }
  return { removed, errors };
}
