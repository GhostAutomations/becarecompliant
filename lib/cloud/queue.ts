import "server-only";

/**
 * Be Care Compliant — the ONE way any feature asks for a document to be copied to the company's
 * cloud drive (0437). Call it after the thing has been saved; it never throws and never slows the
 * save down:
 *
 *   await queueCloudCopy({ companyId, kind: "evidence", sourceId: evidenceId });
 *
 * Does nothing for a company without a working connection. Queueing the same document twice is
 * harmless (unique key). The copy itself runs straight after the response is sent, and the
 * five minute cron catches anything that did not finish.
 */

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { processCloudQueue } from "@/lib/cloud/worker";
import type { CloudSourceKind } from "@/lib/cloud/sources";

export async function queueCloudCopy(opts: {
  companyId: string;
  kind: CloudSourceKind;
  sourceId: string;
  /** Normally the kind and id. Give one when the same source is copied again on purpose (a new
   *  version of the same thing). */
  dedupeKey?: string;
}): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: c } = await db
      .from("cloud_connections")
      .select("status")
      .eq("company_id", opts.companyId)
      .maybeSingle<{ status: string }>();
    // Not connected at all: nothing to do. Needs reconnecting: still queue it, so nothing is lost.
    if (!c || c.status === "disconnected") return;
    const { error } = await db.from("cloud_sync_queue").upsert(
      {
        company_id: opts.companyId,
        source_kind: opts.kind,
        source_id: opts.sourceId,
        dedupe_key: opts.dedupeKey ?? `${opts.kind}:${opts.sourceId}`,
      },
      { onConflict: "company_id,dedupe_key", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[cloud] could not queue a copy:", error.message);
      return;
    }
    if (c.status === "connected") {
      try {
        after(() => processCloudQueue({ companyId: opts.companyId, limit: 10, budgetMs: 25_000 }).then(() => undefined));
      } catch {
        // Outside a request (a script or a test): the cron will pick it up.
      }
    }
  } catch (e) {
    console.error("[cloud] queueCloudCopy failed:", (e as Error).message);
  }
}
