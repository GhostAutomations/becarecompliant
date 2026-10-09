import "server-only";

/**
 * Be Care Compliant — the ONE way any feature asks for a document to be copied to the company's
 * cloud drive (0437). Call it after the thing has been saved; it never throws and never slows the
 * save down:
 *
 *   await queueCloudCopy({ companyId, kind: "evidence", sourceId: evidenceId });
 *   await queueCloudCopies(companyId, [{ kind: "evidence", sourceId }, { kind: "evidence_file", ... }]);
 *
 * Does nothing for a company without a connection. Queueing the same document twice is harmless
 * (unique key). The copy itself runs straight after the response is sent, and the every minute
 * cron catches anything that did not finish.
 *
 * KEPT CHEAP (review, 2026-10-09). Many documents saved together (an import, a form with five
 * uploads, a briefing with files) are queued in one write, the connection is looked up once every
 * few seconds rather than once per document, and only one background copy run per company is
 * started at a time in an instance: anything queued while one is running is picked up by it.
 */

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { processCloudQueue } from "@/lib/cloud/worker";
import type { CloudSourceKind } from "@/lib/cloud/sources";

export type CloudCopyRequest = {
  kind: CloudSourceKind;
  sourceId: string;
  /** Normally the kind and id. Give one when the same source is copied again on purpose (a new
   *  version of the same thing). */
  dedupeKey?: string;
};

const STATUS_TTL_MS = 10_000;
const statusCache = new Map<string, { status: string | null; at: number }>();

async function connectionStatus(companyId: string): Promise<string | null> {
  const hit = statusCache.get(companyId);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.status;
  const db = createServiceClient();
  const { data, error } = await db
    .from("cloud_connections")
    .select("status")
    .eq("company_id", companyId)
    .maybeSingle<{ status: string }>();
  // A failed lookup is not remembered, and is treated as "maybe connected" so the copy is queued
  // rather than silently dropped (the worker checks the connection again before copying).
  if (error) return "connected";
  const status = data?.status ?? null;
  statusCache.set(companyId, { status, at: Date.now() });
  return status;
}

/** Settings changed the connection: look it up afresh next time. */
export function forgetCloudStatus(companyId: string): void {
  statusCache.delete(companyId);
}

const running = new Map<string, { again: boolean }>();

/** Start copying for this company after the response, unless a run here is already going. */
function kick(companyId: string): void {
  const live = running.get(companyId);
  if (live) {
    live.again = true;
    return;
  }
  const state = { again: false };
  running.set(companyId, state);
  try {
    after(async () => {
      try {
        // At most three goes; anything still waiting after that is the cron's (every minute).
        // Kept short so it fits however long the page's own function may run.
        for (let go = 0; go < 3; go++) {
          state.again = false;
          await processCloudQueue({ companyId, limit: 15, budgetMs: 12_000 });
          if (!state.again) break;
        }
      } catch (e) {
        console.error("[cloud] background copy failed:", (e as Error).message);
      } finally {
        running.delete(companyId);
      }
    });
  } catch {
    // Outside a request (a script or a test): the cron will pick it up.
    running.delete(companyId);
  }
}

export async function queueCloudCopies(companyId: string, items: CloudCopyRequest[]): Promise<void> {
  if (!companyId || items.length === 0) return;
  try {
    const status = await connectionStatus(companyId);
    // Not connected at all: nothing to do. Needs reconnecting: still queue it, so nothing is lost.
    if (!status || status === "disconnected") return;
    const rows = items.map((i) => ({
      company_id: companyId,
      source_kind: i.kind,
      source_id: i.sourceId,
      dedupe_key: i.dedupeKey ?? `${i.kind}:${i.sourceId}`,
    }));
    const db = createServiceClient();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db
        .from("cloud_sync_queue")
        .upsert(rows.slice(i, i + 500), { onConflict: "company_id,dedupe_key", ignoreDuplicates: true });
      if (error) {
        console.error("[cloud] could not queue copies:", error.message);
        return;
      }
    }
    if (status === "connected") kick(companyId);
  } catch (e) {
    console.error("[cloud] queueCloudCopies failed:", (e as Error).message);
  }
}

export async function queueCloudCopy(opts: { companyId: string } & CloudCopyRequest): Promise<void> {
  await queueCloudCopies(opts.companyId, [opts]);
}

/**
 * A record has been deleted: forget its folder and anything still waiting for it, so its name
 * does not linger in our own tables. (Its folder in the company's drive is theirs and is left.)
 */
export async function forgetCloudRecord(companyId: string, folderKey: string): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("cloud_folders").delete().eq("company_id", companyId).eq("folder_key", folderKey);
    // Its category folders too (Holiday, Documents ...), remembered as "<key>/<category>".
    await db.from("cloud_folders").delete().eq("company_id", companyId).like("folder_key", `${folderKey}/%`);
    await db.from("cloud_sync_queue").delete().eq("company_id", companyId).eq("source_id", folderKey);
  } catch (e) {
    console.error("[cloud] forgetCloudRecord failed:", (e as Error).message);
  }
}

/**
 * An Evidence row has been anonymised: the records of its copies (their file names carry
 * initials and an SSID, and an upload's original file name sits in its key) are deleted here.
 * Nothing will queue it again: anonymised Evidence is never copied.
 */
export async function forgetCloudEvidenceNames(companyId: string, evidenceId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId)) return;
  try {
    const db = createServiceClient();
    await db
      .from("cloud_sync_queue")
      .delete()
      .eq("company_id", companyId)
      .or(`source_id.eq.${evidenceId},source_id.like.${evidenceId}|*`);
  } catch (e) {
    console.error("[cloud] forgetCloudEvidenceNames failed:", (e as Error).message);
  }
}
