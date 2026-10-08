import "server-only";

/**
 * Be Care Compliant — the cloud drive copier (0437). Works through cloud_sync_queue: claims a
 * job, works out the document (lib/cloud/sources.ts), makes sure its folder exists
 * (lib/cloud/folders.ts), uploads it, and closes the job. Run right after something is queued
 * (lib/cloud/queue.ts) and every five minutes by the cron, so a failure is always picked up.
 *
 * Safe to run twice at once: a job is claimed by moving it pending -> working in one update, and
 * uploads replace a file of the same name, so even a double upload leaves one file.
 *
 *   Microsoft busy or down   -> back to pending, tried again after the wait Microsoft asks for
 *   Connection broken        -> left waiting; the company is told to reconnect; nothing lost
 *   Anything else            -> retried with a growing wait, failed after six tries (shown in
 *                               Settings with Retry)
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getAccessToken, isReady, recordCloudError, type CloudConnection } from "@/lib/cloud/connection";
import { CloudAuthError, CloudNotFoundError, CloudRetryError, uploadMsFile } from "@/lib/cloud/microsoft";
import { resolveCloudCopy } from "@/lib/cloud/sources";
import { ensureFolder, forgetFolderChain } from "@/lib/cloud/folders";

const MAX_ATTEMPTS = 6;

type Job = {
  id: string;
  company_id: string;
  source_kind: string;
  source_id: string;
  attempts: number;
};

export type WorkerResult = { copied: number; retried: number; failed: number; skipped: number; waiting: number };

export async function processCloudQueue(opts: {
  companyId?: string;
  limit?: number;
  budgetMs?: number;
} = {}): Promise<WorkerResult> {
  const db = createServiceClient();
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const result: WorkerResult = { copied: 0, retried: 0, failed: 0, skipped: 0, waiting: 0 };

  // A job claimed by a run that died part way is handed back after ten minutes.
  await db
    .from("cloud_sync_queue")
    .update({ status: "pending", claimed_at: null })
    .eq("status", "working")
    .lt("claimed_at", new Date(Date.now() - 10 * 60_000).toISOString());

  let q = db
    .from("cloud_sync_queue")
    .select("id, company_id, source_kind, source_id, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 40);
  if (opts.companyId) q = q.eq("company_id", opts.companyId);
  const { data: jobs } = await q;
  if (!jobs || jobs.length === 0) return result;

  const connections = new Map<string, CloudConnection | null>();
  const tokens = new Map<string, string>();
  const blocked = new Set<string>();

  for (const job of jobs as Job[]) {
    if (Date.now() - started > budget) break;
    if (blocked.has(job.company_id)) continue;

    if (!connections.has(job.company_id)) {
      const { data } = await db.from("cloud_connections").select("*").eq("company_id", job.company_id).maybeSingle();
      connections.set(job.company_id, (data as CloudConnection | null) ?? null);
    }
    const c = connections.get(job.company_id) ?? null;
    if (!isReady(c)) {
      // Not connected (or needs reconnecting): leave it waiting and look again in half an hour.
      blocked.add(job.company_id);
      result.waiting += 1;
      await db
        .from("cloud_sync_queue")
        .update({ next_attempt_at: new Date(Date.now() + 30 * 60_000).toISOString() })
        .eq("company_id", job.company_id)
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString());
      continue;
    }

    const { data: claimed } = await db
      .from("cloud_sync_queue")
      .update({ status: "working", claimed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      let token = tokens.get(job.company_id);
      if (!token) {
        token = await getAccessToken(c);
        tokens.set(job.company_id, token);
      }
      const copy = await resolveCloudCopy(job.company_id, job.source_kind, job.source_id);
      if (!copy) {
        await db
          .from("cloud_sync_queue")
          .update({ status: "done", done_at: new Date().toISOString(), last_error: "Nothing to copy any more." })
          .eq("id", job.id);
        result.skipped += 1;
        continue;
      }
      let folderId = await ensureFolder(c, token, copy.folderKey);
      if (copy.folderOnly) {
        await db
          .from("cloud_sync_queue")
          .update({ status: "done", done_at: new Date().toISOString(), drive_item_id: folderId, last_error: null, attempts: job.attempts + 1 })
          .eq("id", job.id);
        result.copied += 1;
        continue;
      }
      let item;
      try {
        item = await uploadMsFile(token, c.drive_id, folderId, copy.fileName, copy.bytes, copy.contentType);
      } catch (e) {
        if (!(e instanceof CloudNotFoundError)) throw e;
        // The folder was deleted in the drive since we last used it: make it again and retry once.
        await forgetFolderChain(c, copy.folderKey);
        folderId = await ensureFolder(c, token, copy.folderKey, true);
        item = await uploadMsFile(token, c.drive_id, folderId, copy.fileName, copy.bytes, copy.contentType);
      }
      await db
        .from("cloud_sync_queue")
        .update({
          status: "done",
          done_at: new Date().toISOString(),
          drive_item_id: item.id,
          file_name: copy.fileName,
          last_error: null,
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);
      await db
        .from("cloud_connections")
        .update({ last_copied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", c.id);
      result.copied += 1;
    } catch (e) {
      const message = (e as Error).message || "The copy failed.";
      if (e instanceof CloudAuthError) {
        blocked.add(job.company_id);
        await db.from("cloud_sync_queue").update({ status: "pending", claimed_at: null }).eq("id", job.id);
        result.waiting += 1;
        continue;
      }
      if (e instanceof CloudRetryError) {
        await db
          .from("cloud_sync_queue")
          .update({
            status: "pending",
            claimed_at: null,
            next_attempt_at: new Date(Date.now() + Math.max(30, e.retryAfterSeconds) * 1000).toISOString(),
            last_error: message,
          })
          .eq("id", job.id);
        result.retried += 1;
        continue;
      }
      const attempts = job.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db
        .from("cloud_sync_queue")
        .update({
          status: failed ? "failed" : "pending",
          claimed_at: null,
          attempts,
          last_error: message.slice(0, 500),
          next_attempt_at: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
        })
        .eq("id", job.id);
      await recordCloudError(c.id, message);
      if (failed) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}
