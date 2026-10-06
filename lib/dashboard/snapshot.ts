import "server-only";

/**
 * Be Care Compliant: the dashboard's ten minute snapshot (0413).
 *
 * Phil, 2026-10-07: "when they click dashboard, it takes too long ... is it possible to say load
 * it every 10 minutes ... if the supervisor completes something ... it changes to eight, but it's
 * because of a push, not because of a refresh."
 *
 * The slow part of the dashboard is a handful of engines that read whole registers: the
 * compliance score, training, policy coverage, audits, PQS and branch readiness. They are worked
 * out at most once every ten minutes per person and company and kept here; the quick, live tiles
 * (overdue, due soon, absence, holidays, incidents, complaints, planner) are read fresh every time,
 * so a push still moves them straight away. Refresh on the dashboard clears the snapshot.
 *
 * The snapshot holds only what that person's own reads returned (their RLS), keyed by their id,
 * and only the server reads it, so nobody ever sees figures worked out for someone else.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

export type Snapshot<T> = { payload: T; builtAt: string };

/** The saved figures, when they are younger than ten minutes and were built for this role. */
export async function readSnapshot<T>(userId: string, companyId: string, role: string): Promise<Snapshot<T> | null> {
  try {
    const { data } = await createServiceClient()
      .from("dashboard_snapshots")
      .select("payload, built_at, role")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle<{ payload: T; built_at: string; role: string }>();
    if (!data || data.role !== role) return null;
    if (Date.now() - new Date(data.built_at).getTime() > SNAPSHOT_MAX_AGE_MS) return null;
    return { payload: data.payload, builtAt: data.built_at };
  } catch {
    return null;
  }
}

/** Keep freshly worked out figures. A failure only means the next load works them out again. */
export async function writeSnapshot<T>(userId: string, companyId: string, role: string, payload: T): Promise<string> {
  const builtAt = new Date().toISOString();
  try {
    await createServiceClient()
      .from("dashboard_snapshots")
      .upsert({ user_id: userId, company_id: companyId, role, payload, built_at: builtAt }, { onConflict: "user_id,company_id" });
  } catch (e) {
    console.error("[dashboard] snapshot not saved", { error: (e as Error).message });
  }
  return builtAt;
}

/** Forget the saved figures, so the next load works them out fresh (the Refresh button). */
export async function clearSnapshot(userId: string, companyId: string): Promise<void> {
  try {
    await createServiceClient().from("dashboard_snapshots").delete().eq("user_id", userId).eq("company_id", companyId);
  } catch (e) {
    console.error("[dashboard] snapshot not cleared", { error: (e as Error).message });
  }
}
