import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIER_BASE_PENCE } from "@/lib/stripe/config";
import { EXTRA_BRANCH_PENCE, EXTRA_SEAT_PENCE, includedBranchesForTier, includedSeatsForTier } from "@/lib/billing/seats";
import { ANNUAL_MONTHS_CHARGED, PRICE_LIST_DATE, aiMonthlyCredits, smsMonthlyCredits } from "@/lib/billing/allowances";
import { ONBOARDING_FEE, ONBOARDING_OFFER_END_TEXT, onboardingOfferActive } from "@/lib/marketing/offer";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { branchWord, dealPrices, type BranchWord, type DealRow } from "@/lib/billing/deal";
import { getDeal } from "@/lib/billing/deal-store";
import {
  money,
  onboardingFeeLabel,
  orderExtrasText,
  orderIncludedList,
  orderIncludedText,
  orderPriceListText,
  type OrderBranchStep,
} from "@/lib/legal/fill";

/**
 * WHAT THE ORDER SAYS FOR THIS COMPANY, in one place (0354). The accept screen shows it and the
 * server that records the acceptance recomputes it the same way, so the Admin is never shown one
 * thing and signed up to another. With a founder deal the Order is filled in and fixed, and any
 * special prices replace the list prices; without one it is the list prices and they choose.
 */
export type OrderTerms = {
  tier: string | null;
  word: BranchWord;
  deal: DealRow | null;
  /** The deal's fixed choices, or null when the Admin chooses on the Order. */
  fixed: { billingOption: "monthly" | "annual"; extrasBilling: "monthly" | "yearly"; extraUsers: number; extraBranches: number } | null;
  monthlyPence: number | null;
  seatPence: number;
  branchPence: number;
  step: OrderBranchStep;
  special: boolean;
  annualMonths: number;
  allowance: { users: number; branches: number; ai: number; sms: number };
  includedList: string[];
  includedText: string;
  extrasText: string;
  priceListText: string;
  onboardingFee: string;
  /** Pence due for onboarding on the first payment: the deal's amount, else the offer rule. */
  onboardingPence: number | null;
};

export async function loadOrderTerms(supabase: SupabaseClient, companyId: string): Promise<OrderTerms> {
  const { data: co } = await supabase
    .from("companies")
    .select("tier, branch_word, branch_word_plural")
    .eq("id", companyId)
    .maybeSingle();
  const c = (co ?? {}) as { tier?: string | null; branch_word?: string | null; branch_word_plural?: string | null };
  const tier = c.tier ?? null;
  const word = branchWord(c);
  const billed = tier === "business" || tier === "pro";
  const deal = billed ? await getDeal(supabase, companyId) : null;
  const prices = dealPrices(deal, {
    planPence: billed ? TIER_BASE_PENCE[tier as "business" | "pro"] : 0,
    seatPence: EXTRA_SEAT_PENCE,
    branchPence: EXTRA_BRANCH_PENCE,
  });
  const allowance = {
    users: includedSeatsForTier(tier ?? "business"),
    branches: includedBranchesForTier(tier ?? "business"),
    ai: aiMonthlyCredits(tier),
    sms: smsMonthlyCredits(tier),
  };
  const extrasText = orderExtrasText({ tier, seatPence: prices.seatPence, branchPence: prices.branchPence, step: prices.step, word });
  const today = formatCivilDate(todayInLondon());
  const dealFee = deal?.onboarding_fee_pence ?? null;
  const onboardingFee =
    tier === "black" || dealFee === null
      ? onboardingFeeLabel({ tier, offerActive: onboardingOfferActive(today), fee: ONBOARDING_FEE, offerEnd: ONBOARDING_OFFER_END_TEXT })
      : dealFee === 0
        ? "Waived"
        : `${money(dealFee)} plus VAT`;

  return {
    tier,
    word,
    deal,
    fixed:
      deal && deal.billing_option
        ? {
            billingOption: deal.billing_option === "annual" ? "annual" : "monthly",
            extrasBilling: deal.billing_option === "annual" && deal.extras_billing === "monthly" ? "monthly" : deal.billing_option === "annual" ? "yearly" : "monthly",
            extraUsers: deal.extra_users ?? 0,
            extraBranches: deal.extra_branches ?? 0,
          }
        : null,
    monthlyPence: billed ? prices.planPence : null,
    seatPence: prices.seatPence,
    branchPence: prices.branchPence,
    step: prices.step,
    special: prices.special,
    annualMonths: ANNUAL_MONTHS_CHARGED,
    allowance,
    includedList: orderIncludedList({ ...allowance, word }),
    includedText: orderIncludedText({ ...allowance, word }),
    extrasText,
    priceListText: prices.special ? `${extrasText} (prices agreed with you)` : orderPriceListText(extrasText, PRICE_LIST_DATE),
    onboardingFee,
    onboardingPence: tier === "black" ? 0 : dealFee,
  };
}
