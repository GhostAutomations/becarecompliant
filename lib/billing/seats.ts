import { createClient } from "@/lib/supabase/server";

/** Default included users (Business). Two-tier model (Phil, 2026-07-19): Business
 *  includes 4 users, Pro includes 6; legacy/premium tiers match Pro or above. */
export const INCLUDED_SEATS = 4;
/** Then £5 per extra user per month. Stored in pence to avoid float drift. */
export const EXTRA_SEAT_PENCE = 500;

/** Included users by tier. Business 4, Pro 6, legacy/premium at least 6. */
export function includedSeatsForTier(tier: string): number {
  switch (tier) {
    case "pro":
    case "enterprise":
    case "diamond":
      return 6;
    case "black":
      return 9999;
    default:
      return INCLUDED_SEATS; // business + unknown
  }
}

/** Included branches by tier. Business 1, Pro 2, legacy/premium at least 2. Then
 *  £7.50 per extra branch per month. Branches are founder provisioned. */
export const EXTRA_BRANCH_PENCE = 750;
export function includedBranchesForTier(tier: string): number {
  switch (tier) {
    case "pro":
    case "enterprise":
    case "diamond":
      return 2;
    case "black":
      return 9999;
    default:
      return 1; // business + unknown
  }
}

export type SeatUsage = {
  used: number;
  included: number;
  extra: number;
  extraCostPence: number;
};

/** Pure computation, unit-testable without a database. */
export function computeSeatUsage(activeUsers: number, included: number = INCLUDED_SEATS): SeatUsage {
  const used = Math.max(0, Math.trunc(activeUsers));
  const extra = Math.max(0, used - included);
  return {
    used,
    included,
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
  const [{ data: count }, { data: company }] = await Promise.all([
    supabase.rpc("company_active_user_count", { cid: companyId }),
    supabase.from("companies").select("tier").eq("id", companyId).maybeSingle(),
  ]);
  const included = includedSeatsForTier((company?.tier as string) ?? "business");
  return computeSeatUsage(typeof count === "number" ? count : 0, included);
}

export type BranchUsage = { used: number; included: number; extra: number; extraCostPence: number };

/** Operational branches (kind = 'branch', excluding the office/team) vs the tier's
 *  included allowance, with the £7.50/extra add-on cost for display. */
export async function getBranchUsage(companyId: string, tier: string): Promise<BranchUsage> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("kind", "branch");
  const used = count ?? 0;
  const included = includedBranchesForTier(tier);
  const extra = Math.max(0, used - included);
  return { used, included, extra, extraCostPence: extra * EXTRA_BRANCH_PENCE };
}
