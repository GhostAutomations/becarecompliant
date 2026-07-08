import { createClient } from "@/lib/supabase/server";

/** Every account includes 4 users. Fixed product rule (subscription tiers). */
export const INCLUDED_SEATS = 4;
/** Then £5 per extra user per month. Stored in pence to avoid float drift. */
export const EXTRA_SEAT_PENCE = 500;

export type SeatUsage = {
  used: number;
  included: number;
  extra: number;
  extraCostPence: number;
};

/** Pure computation, unit-testable without a database. */
export function computeSeatUsage(activeUsers: number): SeatUsage {
  const used = Math.max(0, Math.trunc(activeUsers));
  const extra = Math.max(0, used - INCLUDED_SEATS);
  return {
    used,
    included: INCLUDED_SEATS,
    extra,
    extraCostPence: extra * EXTRA_SEAT_PENCE,
  };
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Live seat usage for a company. Reads the guarded company_active_user_count
 * RPC (returns null unless the caller belongs to the company). No Stripe here:
 * metering and billing land in Phase 7; this is the display + hook.
 */
export async function getSeatUsage(companyId: string): Promise<SeatUsage> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("company_active_user_count", {
    cid: companyId,
  });
  return computeSeatUsage(typeof data === "number" ? data : 0);
}
