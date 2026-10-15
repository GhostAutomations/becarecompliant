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
 * out at most once every ten minutes per person and company and kept here. Since 2026-10-15 (0482)
 * the quick tiles (overdue, due soon, absence, holidays, incidents, complaints, planner) are kept
 * here too and worked out again only when something they read has changed, so a push still moves
 * them straight away (lib/dashboard/tiles.ts). Refresh on the dashboard clears the snapshot.
 *
 * The snapshot holds only what that person's own reads returned (their RLS), keyed by their id,
 * and only the server reads it, so nobody ever sees figures worked out for someone else.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type Snapshot<T> = { payload: T; builtAt: string };

/**
 * THE WHOLE DASHBOARD FROM THE SAVED COPY (Phil, 2026-10-15; 0482; lib/dashboard/tiles.ts).
 * The copy whatever its age, for the page to show at once and bring up to date itself.
 */
export async function readDashboardCopy<T>(
  userId: string,
  companyId: string,
): Promise<{ payload: T; builtAt: string; role: string } | null> {
  try {
    const { data } = await createServiceClient()
      .from("dashboard_snapshots")
      .select("payload, built_at, role")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle<{ payload: T; built_at: string; role: string }>();
    return data ? { payload: data.payload, builtAt: data.built_at, role: data.role } : null;
  } catch {
    return null;
  }
}

/** When each table the tiles read last changed for this company (0482). A failure reads as
 *  "everything changed", so the tiles are worked out again rather than shown out of date. */
export async function readCompanyChanges(
  companyId: string,
): Promise<{ table_name: string; changed_at: string }[] | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("dashboard_changes")
      .select("table_name, changed_at")
      .eq("company_id", companyId);
    if (error) return null;
    return (data as { table_name: string; changed_at: string }[] | null) ?? [];
  } catch {
    return null;
  }
}

/** Keep freshly worked out figures. A failure only means the next load works them out again. */
export async function writeSnapshot<T>(
  userId: string,
  companyId: string,
  role: string,
  payload: T,
  builtAt: string = new Date().toISOString(),
): Promise<string> {
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
