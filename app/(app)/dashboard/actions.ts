"use server";

import { cookies } from "next/headers";
import { requireCompany } from "@/lib/auth/guards";
import { clearSnapshot } from "@/lib/dashboard/snapshot";
import { DASH_REBUILD_COOKIE } from "@/lib/dashboard/tiles";

/** Refresh on the dashboard: drop this person's saved figures so the next render works them out
 *  again. Only ever their own snapshot, for the company they are in (manage as company included). */
export async function refreshDashboardFigures(): Promise<void> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return;
  await clearSnapshot(user.id, profile.company_id);
}

/**
 * Bring the saved copy up to date (the ten minute mark, or a copy found older than it when the
 * page opened; Phil, 2026-10-15: "show it, then update"). Asks for a rebuild by time; setting a
 * cookie in an action redraws the page in the same reply, while the old figures stay on screen.
 * The copy is kept, so leaving at that moment still finds it next time.
 */
export async function requestDashboardRebuild(): Promise<void> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return;
  (await cookies()).set(DASH_REBUILD_COOKIE, String(Date.now()), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60,
  });
}
