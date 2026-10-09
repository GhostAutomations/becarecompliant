import "server-only";

/**
 * Be Care Compliant — how far the cloud drive copies have got, for the live progress bar on
 * Settings, Cloud drive (Phil 2026-10-09: "it said 600 for ages until I refreshed").
 *
 * A "run" is everything queued since the oldest copy still waiting, so pressing Copy everything so
 * far gives a bar from 0 to the full count, and a single new form gives a run of one. The time left
 * comes from how many were copied in the last three minutes.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type CloudProgress = {
  waiting: number;
  failed: number;
  copied30d: number;
  runTotal: number;
  runDone: number;
  perMinute: number;
  minutesLeft: number | null;
  lastCopiedAt: string | null;
};

export async function cloudProgress(companyId: string): Promise<CloudProgress> {
  const db = createServiceClient();
  const q = () => db.from("cloud_sync_queue").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  const now = Date.now();
  const [waiting, failed, copied30d, recent, oldest, conn] = await Promise.all([
    q().in("status", ["pending", "working"]),
    q().eq("status", "failed"),
    q().eq("status", "done").gte("done_at", new Date(now - 30 * 86_400_000).toISOString()),
    q().eq("status", "done").gte("done_at", new Date(now - 3 * 60_000).toISOString()),
    db
      .from("cloud_sync_queue")
      .select("created_at")
      .eq("company_id", companyId)
      .in("status", ["pending", "working"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.from("cloud_connections").select("last_copied_at").eq("company_id", companyId).maybeSingle(),
  ]);

  const w = waiting.count ?? 0;
  let runTotal = 0;
  let runDone = 0;
  const start = (oldest.data as { created_at: string } | null)?.created_at;
  if (w > 0 && start) {
    const [total, done] = await Promise.all([q().gte("created_at", start), q().gte("created_at", start).in("status", ["done", "failed"])]);
    runTotal = total.count ?? w;
    runDone = done.count ?? 0;
  }
  const perMinute = Math.round(((recent.count ?? 0) / 3) * 10) / 10;
  return {
    waiting: w,
    failed: failed.count ?? 0,
    copied30d: copied30d.count ?? 0,
    runTotal,
    runDone,
    perMinute,
    minutesLeft: w > 0 && perMinute > 0 ? Math.max(1, Math.ceil(w / perMinute)) : null,
    lastCopiedAt: (conn.data as { last_copied_at: string | null } | null)?.last_copied_at ?? null,
  };
}
