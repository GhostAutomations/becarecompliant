"use server";

import { requireCompany } from "@/lib/auth/guards";
import { clearSnapshot } from "@/lib/dashboard/snapshot";

/** Refresh on the dashboard: drop this person's saved figures so the next render works them out
 *  again. Only ever their own snapshot, for the company they are in (manage as company included). */
export async function refreshDashboardFigures(): Promise<void> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return;
  await clearSnapshot(user.id, profile.company_id);
}
