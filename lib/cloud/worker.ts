import "server-only";

/**
 * Be Care Compliant — the cloud drive copier (0437). Works through cloud_sync_queue: claims a
 * job, works out the document (lib/cloud/sources.ts), makes sure its folder exists
 * (lib/cloud/folders.ts), uploads it, and closes the job. Run right after something is queued
 * (lib/cloud/queue.ts) and every minute by the cron, so a failure is always picked up.
 *
 * Safe to run twice at once: a job is claimed by moving it pending -> working in one update, and
 * uploads replace a file of the same name, so even a double upload leaves one file.
 *
 *   Microsoft busy or down   -> back to pending, tried again after the wait Microsoft asks for
 *   Key turned down          -> the stored key is dropped and a fresh one asked for; if that is
 *                               turned down too, the company is told to reconnect; nothing lost
 *   A run that died midway   -> handed back after ten minutes, counted as a try
 *   Anything else            -> retried with a growing wait, failed after six tries (shown in
 *                               Settings with Try again now)
 *
 * FAIR BETWEEN COMPANIES (review, 2026-10-09): each run takes a share of the due copies from every
 * connected company in turn, so one company's "Copy everything so far" (thousands of copies)
 * never holds up another company's new documents.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  clearAccessToken,
  getAccessTokenInfo,
  isReady,
  markNeedsReconnect,
  recordCloudError,
  type CloudConnection,
} from "@/lib/cloud/connection";
import { CloudAuthError, CloudNotFoundError, CloudRetryError, moveMsItem, uploadMsFile } from "@/lib/cloud/microsoft";
import { resolveCloudCopy } from "@/lib/cloud/sources";
import { categoryTargetFor } from "@/lib/cloud/categories";
import { ensureFolder, forgetFolderChain } from "@/lib/cloud/folders";

const MAX_ATTEMPTS = 6;
/** No new copy is started this close to the end of the time allowed, so none is cut off midway:
 *  twelve seconds, or four tenths of a short budget. */
function safetyMs(budget: number): number {
  return Math.min(12_000, Math.round(budget * 0.4));
}

type Job = {
  id: string;
  company_id: string;
  source_kind: string;
  source_id: string;
  attempts: number;
};

export type WorkerResult = { copied: number; retried: number; failed: number; skipped: number; waiting: number };

function backoff(attempts: number): string {
  return new Date(Date.now() + 2 ** attempts * 60_000).toISOString();
}

/** Copies a run claimed and then never finished (the function was stopped) go back, as a try. */
async function handBackStuck(): Promise<void> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stuck } = await db
    .from("cloud_sync_queue")
    .select("id, attempts")
    .eq("status", "working")
    .lt("claimed_at", cutoff)
    .limit(200);
  for (const s of (stuck ?? []) as Array<{ id: string; attempts: number }>) {
    const attempts = s.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await db
      .from("cloud_sync_queue")
      .update({
        status: failed ? "failed" : "pending",
        claimed_at: null,
        attempts,
        next_attempt_at: backoff(attempts),
        last_error: failed
          ? "This copy kept stopping part way, so it has been set aside. Try again now will retry it."
          : "The last try stopped part way. Trying again.",
      })
      .eq("id", s.id)
      .eq("status", "working")
      // Not one another run has just claimed again.
      .lt("claimed_at", cutoff);
  }
}

/** The due copies to work on this run: a fair share from each connected company, interleaved. */
async function dueJobs(companyId: string | undefined, limit: number): Promise<Job[]> {
  const db = createServiceClient();
  let companies: string[];
  if (companyId) {
    companies = [companyId];
  } else {
    const { data } = await db
      .from("cloud_connections")
      .select("company_id")
      .eq("status", "connected")
      .not("drive_id", "is", null);
    companies = ((data ?? []) as Array<{ company_id: string }>).map((r) => r.company_id);
  }
  if (companies.length === 0) return [];
  const share = Math.max(5, Math.ceil(limit / companies.length));
  const now = new Date().toISOString();
  const lists = await Promise.all(
    companies.map(async (id) => {
      const { data } = await db
        .from("cloud_sync_queue")
        .select("id, company_id, source_kind, source_id, attempts")
        .eq("company_id", id)
        .eq("status", "pending")
        .lte("next_attempt_at", now)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(share);
      return (data ?? []) as Job[];
    }),
  );
  const out: Job[] = [];
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        any = true;
        if (out.length >= limit) break;
      }
    }
    if (!any) break;
  }
  return out;
}

export async function processCloudQueue(opts: {
  companyId?: string;
  limit?: number;
  budgetMs?: number;
} = {}): Promise<WorkerResult> {
  const db = createServiceClient();
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const result: WorkerResult = { copied: 0, retried: 0, failed: 0, skipped: 0, waiting: 0 };

  await handBackStuck();
  const jobs = await dueJobs(opts.companyId, opts.limit ?? 40);
  if (jobs.length === 0) return result;

  const connections = new Map<string, CloudConnection | null>();
  const tokens = new Map<string, { token: string; refreshed: boolean }>();
  const blocked = new Set<string>();

  for (const job of jobs) {
    if (Date.now() - started > budget - safetyMs(budget)) break;
    if (blocked.has(job.company_id)) continue;

    if (!connections.has(job.company_id)) {
      const { data } = await db.from("cloud_connections").select("*").eq("company_id", job.company_id).maybeSingle();
      connections.set(job.company_id, (data as CloudConnection | null) ?? null);
    }
    const c = connections.get(job.company_id) ?? null;
    if (!isReady(c)) {
      // Not connected, or needs reconnecting: left exactly as it is. Connecting again (or choosing
      // where the folder lives) sets every waiting copy going straight away.
      blocked.add(job.company_id);
      result.waiting += 1;
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
      let key = tokens.get(job.company_id);
      if (!key) {
        key = await getAccessTokenInfo(c);
        tokens.set(job.company_id, key);
      }
      const token = key.token;

      /* REFILE (2026-10-09): a file copied before category folders existed is moved into its
         category folder. source_id is the id of the queue row that copied it. */
      if (job.source_kind === "refile") {
        const note = await refileOne(c, token, job.source_id);
        await db
          .from("cloud_sync_queue")
          .update({ status: "done", done_at: new Date().toISOString(), last_error: note, attempts: job.attempts + 1 })
          .eq("id", job.id)
          .eq("status", "working");
        result.copied += 1;
        continue;
      }

      const copy = await resolveCloudCopy(job.company_id, job.source_kind, job.source_id);
      if (!copy) {
        await db
          .from("cloud_sync_queue")
          .update({ status: "done", done_at: new Date().toISOString(), last_error: "Nothing to copy any more." })
          .eq("id", job.id)
          .eq("status", "working");
        result.skipped += 1;
        continue;
      }
      let folderId = await ensureFolder(c, token, copy.folderKey);
      if (copy.folderOnly) {
        // The record's category folders, all made with its folder (Phil, 2026-10-09).
        for (const k of copy.alsoFolders ?? []) await ensureFolder(c, token, k);
        await db
          .from("cloud_sync_queue")
          .update({ status: "done", done_at: new Date().toISOString(), drive_item_id: folderId, last_error: null, attempts: job.attempts + 1 })
          .eq("id", job.id)
          .eq("status", "working");
        result.copied += 1;
        continue;
      }
      let item;
      try {
        item = await uploadMsFile(token, c.drive_id, folderId, copy.fileName, copy.bytes, copy.contentType);
      } catch (e) {
        if (!(e instanceof CloudNotFoundError)) throw e;
        // The folder (or the whole Be Care Compliant folder) was deleted or moved in the drive
        // since we last used it: check the chain against the drive, make what is missing, and
        // retry once.
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
        .eq("id", job.id)
        // Still ours: if Settings moved the folder somewhere else meanwhile, the job was handed
        // back and will go to the new place instead.
        .eq("status", "working");
      await db
        .from("cloud_connections")
        .update({ last_copied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", c.id);
      result.copied += 1;
    } catch (e) {
      const message = (e as Error).message || "The copy failed.";
      if (e instanceof CloudAuthError) {
        // Not this document's fault: put it back untouched and stop for this company this run.
        blocked.add(job.company_id);
        await db.from("cloud_sync_queue").update({ status: "pending", claimed_at: null }).eq("id", job.id);
        result.waiting += 1;
        const key = tokens.get(job.company_id);
        if (key && !key.refreshed) {
          // A stored key that Microsoft no longer takes: drop it, so the next run asks for a fresh one.
          await clearAccessToken(c);
        } else if (key?.refreshed) {
          // Even a key Microsoft handed over moments ago is turned down: only reconnecting fixes it.
          await markNeedsReconnect(c, message);
        }
        // (No key at all means the refresh itself failed, which has already marked it.)
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
          next_attempt_at: backoff(attempts),
        })
        .eq("id", job.id);
      await recordCloudError(c.id, message);
      if (failed) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}

/**
 * Move one already copied file into its category folder. Returns a note for the job, or null.
 * A file deleted in the drive meanwhile, or one already in the right place, is simply left.
 */
async function refileOne(c: CloudConnection & { drive_id: string; root_folder_id: string }, token: string, queueRowId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("cloud_sync_queue")
    .select("company_id, source_kind, source_id, drive_item_id, status")
    .eq("id", queueRowId)
    .eq("company_id", c.company_id)
    .maybeSingle<{ company_id: string; source_kind: string; source_id: string; drive_item_id: string | null; status: string }>();
  if (!row || row.status !== "done" || !row.drive_item_id) return "Nothing to move.";
  const target = await categoryTargetFor(c.company_id, row.source_kind, row.source_id);
  if (!target) return "Not a record's file: left where it is.";
  const folderId = await ensureFolder(c, token, target);
  try {
    await moveMsItem(token, c.drive_id, row.drive_item_id, folderId);
    return null;
  } catch (e) {
    if (e instanceof CloudNotFoundError) return "The file is no longer in the drive.";
    const err = e as { status?: number; code?: string };
    if (err.status === 409 || err.code === "nameAlreadyExists") return "A file of that name is already in the folder: left where it is.";
    throw e;
  }
}
