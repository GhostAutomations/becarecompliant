import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDealForm, pluralOf, type DealRow } from "@/lib/billing/deal";

/**
 * Reading and writing a company's deal (0354). Not a "use server" file: it exports helpers for the
 * founder actions to share (createCompany and the founder company page), so both save a deal the
 * same way. The founder-only RLS policy on company_deals is the real guard; callers also check.
 */

export const DEAL_COLUMNS =
  "billing_option, extras_billing, extra_users, extra_branches, plan_price_pence, seat_price_pence, branch_price_pence, branch_step_after, branch_step_price_pence, onboarding_fee_pence, stripe_price_ids, notes, updated_at";

export type StoredDeal = DealRow & { stripe_price_ids: Record<string, string>; notes: string | null; updated_at: string };

/** The founder's deal form fields, read from a submitted form. */
export function dealInputFrom(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    billingOption: s("deal_billing"),
    extrasBilling: s("deal_extras_billing"),
    extraUsers: s("deal_extra_users"),
    extraBranches: s("deal_extra_branches"),
    planPrice: s("deal_plan_price"),
    seatPrice: s("deal_seat_price"),
    branchPrice: s("deal_branch_price"),
    stepAfter: s("deal_step_after"),
    stepPrice: s("deal_step_price"),
    onboarding: s("deal_onboarding") || "standard",
    onboardingAmount: s("deal_onboarding_amount"),
  };
}

/** Parse the deal part of a founder form. "none" = no deal, the customer chooses on the Order. */
export function parseDealFromForm(fd: FormData):
  | { ok: true; row: DealRow | null; notes: string | null }
  | { ok: false; error: string } {
  if (String(fd.get("deal_mode") ?? "none") !== "fixed") return { ok: true, row: null, notes: null };
  const parsed = parseDealForm(dealInputFrom(fd));
  if (!parsed.ok) return parsed;
  const notes = String(fd.get("deal_notes") ?? "").trim().slice(0, 2000) || null;
  return { ok: true, row: parsed.row, notes };
}

/** The company's own word for a branch from a founder form. Blank = Branch. */
export function branchWordFromForm(fd: FormData): { one: string | null; many: string | null } | { error: string } {
  const one = String(fd.get("branch_word") ?? "").trim();
  const many = String(fd.get("branch_word_plural") ?? "").trim();
  if (!one && !many) return { one: null, many: null };
  if (!one) return { error: "Enter the word for one branch as well as the plural, for example House and Houses." };
  if (one.length > 30 || many.length > 30) return { error: "Keep the branch word to 30 letters or fewer." };
  return { one, many: many || pluralOf(one) };
}

export async function getDeal(supabase: SupabaseClient, companyId: string): Promise<StoredDeal | null> {
  const { data } = await supabase.from("company_deals").select(DEAL_COLUMNS).eq("company_id", companyId).maybeSingle();
  return (data as StoredDeal | null) ?? null;
}

/** Save (or clear, with row = null) a company's deal. Keeps the Stripe prices already made. */
export async function writeDeal(
  supabase: SupabaseClient,
  companyId: string,
  row: DealRow | null,
  notes: string | null,
  userId: string,
): Promise<{ error?: string }> {
  if (!row) {
    const { error } = await supabase.from("company_deals").delete().eq("company_id", companyId);
    return error ? { error: error.message } : {};
  }
  const { error } = await supabase
    .from("company_deals")
    .upsert({ company_id: companyId, ...row, notes, updated_by: userId }, { onConflict: "company_id" });
  return error ? { error: error.message } : {};
}

/** The onboarding fee a company's deal sets, in pence: 0 = waived, null = no deal or the offer
 *  rule applies. Read with the service client, because checkout runs it for the Admin. */
export async function dealOnboardingPence(companyId: string): Promise<number | null> {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  const { data } = await admin.from("company_deals").select("onboarding_fee_pence").eq("company_id", companyId).maybeSingle();
  const v = (data as { onboarding_fee_pence: number | null } | null)?.onboarding_fee_pence;
  return typeof v === "number" ? v : null;
}

/** Every company's deal the caller can see (the founder sees all), for the founder totals. */
export async function dealsByCompany(supabase: SupabaseClient): Promise<Map<string, DealRow>> {
  const map = new Map<string, DealRow>();
  const { data, error } = await supabase.from("company_deals").select(`company_id, ${DEAL_COLUMNS}`);
  if (error) {
    console.error("[billing] deals list failed:", error.message);
    return map;
  }
  for (const row of (data ?? []) as Array<DealRow & { company_id: string }>) map.set(row.company_id, row);
  return map;
}
