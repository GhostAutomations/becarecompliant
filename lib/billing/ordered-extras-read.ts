import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderedExtrasFrom, NO_ORDERED_EXTRAS, type OrderedExtras } from "@/lib/billing/ordered-extras";
import { orderedExtrasOnTier } from "@/lib/billing/seats";

/**
 * The latest accepted Order's extras for every company the caller can see, for the founder
 * screens that total what each company pays (Phil, 2026-09-30: what they ordered is the least
 * they pay for, so the founder totals must use the same floor as Stripe). One query, newest
 * first, first row per company wins. A read failure returns an empty map: the screens then show
 * what exists, never more.
 */
export async function orderedExtrasByCompany(
  supabase: SupabaseClient,
): Promise<Map<string, OrderedExtras>> {
  const map = new Map<string, OrderedExtras>();
  const { data, error } = await supabase
    .from("agreement_acceptances")
    .select("company_id, extra_users, extra_branches, plan, accepted_at")
    .not("company_id", "is", null)
    .order("accepted_at", { ascending: false });
  if (error) {
    console.error("[billing] ordered extras list failed:", error.message);
    return map;
  }
  for (const row of (data ?? []) as {
    company_id: string;
    extra_users: number | null;
    extra_branches: number | null;
    plan: string | null;
  }[]) {
    if (!map.has(row.company_id)) map.set(row.company_id, orderedExtrasFrom(row));
  }
  return map;
}

/** One company's ordered extras, counted against the plan it is on now. */
export function orderedFor(
  map: Map<string, OrderedExtras>,
  companyId: string,
  tier: string,
): { users: number; branches: number } {
  return orderedExtrasOnTier(map.get(companyId) ?? NO_ORDERED_EXTRAS, tier);
}
