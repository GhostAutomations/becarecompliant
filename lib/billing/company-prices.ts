import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import {
  TIER_BASE_PENCE,
  YEARLY_MONTHS_CHARGED,
  allBasePriceIds,
  branchPriceId,
  seatPriceId,
  tierBasePriceId,
  type BillingInterval,
  type SubscriptionTier,
} from "@/lib/stripe/config";
import { EXTRA_BRANCH_PENCE, EXTRA_SEAT_PENCE } from "@/lib/billing/seats";
import { branchWord, dealPrices, lower, type BranchWord, type DealRow } from "@/lib/billing/deal";

/**
 * THE PRICES A COMPANY IS ACTUALLY CHARGED (0354, Phil 2026-09-30).
 *
 * Without a deal, or where a deal leaves a price blank, it is the list price from the
 * environment, exactly as before. Where a deal sets a special price, a Stripe Price is made for
 * that company, once, on the same Stripe product as the list price, and its id is kept in
 * company_deals.stripe_price_ids under a key that includes the amount. So changing a deal's price
 * makes a new Stripe Price rather than silently re-pricing an old one, and asking twice never
 * makes two.
 *
 * A two-step branch price ("the first 3 at £25, the rest at £10") is one Stripe Price with
 * graduated tiers, which Stripe applies per quantity on a licensed subscription line.
 * Annual is ten months for twelve on whatever price is set.
 */

export type CompanyPrices = {
  plan: string | null;
  seat: string | null;
  branch: string | null;
  /** Every seat or branch price that is this company's, list or special, month or year. For
   *  telling the plan line apart from the extras on a subscription. */
  addOnIds: string[];
  /** Every price recognised as a plan line for this company: the list ones and its specials. */
  baseIds: string[];
  /** Which lines use a special price made from the deal (the list price guard skips those). */
  special: { plan: boolean; seat: boolean; branch: boolean };
};

type StoredDeal = DealRow & { stripe_price_ids: Record<string, string> | null };

const DEAL_COLS =
  "billing_option, extras_billing, extra_users, extra_branches, plan_price_pence, seat_price_pence, branch_price_pence, branch_step_after, branch_step_price_pence, onboarding_fee_pence, stripe_price_ids";

async function readDeal(companyId: string): Promise<StoredDeal | null> {
  const admin = createServiceClient();
  const { data } = await admin.from("company_deals").select(DEAL_COLS).eq("company_id", companyId).maybeSingle();
  return (data as StoredDeal | null) ?? null;
}

async function remember(companyId: string, key: string, priceId: string): Promise<void> {
  const admin = createServiceClient();
  const { data } = await admin.from("company_deals").select("stripe_price_ids").eq("company_id", companyId).maybeSingle();
  const ids = { ...((data?.stripe_price_ids as Record<string, string> | null) ?? {}), [key]: priceId };
  await admin.from("company_deals").update({ stripe_price_ids: ids }).eq("company_id", companyId);
}

/** Make (or find) the Stripe Price for one special line. Returns null if Stripe cannot be reached. */
async function specialPrice(
  companyId: string,
  deal: StoredDeal,
  key: string,
  listPriceId: string | null,
  interval: BillingInterval,
  amount: { unitPence: number } | { firstPence: number; after: number; restPence: number },
): Promise<string | null> {
  const known = deal.stripe_price_ids?.[key];
  if (known) return known;
  const stripe = getStripe();
  if (!stripe || !listPriceId) return null;
  const m = interval === "year" ? YEARLY_MONTHS_CHARGED : 1;
  try {
    const list = await stripe.prices.retrieve(listPriceId);
    const product = typeof list.product === "string" ? list.product : list.product.id;
    const common = {
      currency: "gbp",
      product,
      recurring: { interval, usage_type: "licensed" as const },
      nickname: `Deal ${companyId.slice(0, 8)} ${key}`,
      metadata: { company_id: companyId, deal_key: key },
    };
    const created =
      "unitPence" in amount
        ? await stripe.prices.create(
            { ...common, unit_amount: amount.unitPence * m },
            { idempotencyKey: `bcc-deal-price-${companyId}-${key}` },
          )
        : await stripe.prices.create(
            {
              ...common,
              billing_scheme: "tiered",
              tiers_mode: "graduated",
              tiers: [
                { up_to: amount.after, unit_amount: amount.firstPence * m },
                { up_to: "inf", unit_amount: amount.restPence * m },
              ],
            },
            { idempotencyKey: `bcc-deal-price-${companyId}-${key}` },
          );
    await remember(companyId, key, created.id);
    return created.id;
  } catch (e) {
    console.error(`[billing] could not make the deal price ${key}:`, (e as Error).message);
    return null;
  }
}

/** The company's word for a branch (0354), read with the service client (billing runs in webhooks). */
async function readBranchWord(companyId: string): Promise<BranchWord> {
  const admin = createServiceClient();
  const { data } = await admin.from("companies").select("branch_word, branch_word_plural").eq("id", companyId).maybeSingle();
  return branchWord(data as { branch_word?: string | null; branch_word_plural?: string | null } | null);
}

/**
 * THE EXTRA BRANCH LINE IN THEIR OWN WORD (Phil, 2026-09-30: invoices say "house" too).
 *
 * Stripe prints the product's name on every invoice and Checkout line, so a company that calls its
 * branches houses gets its own product, "Extra house", with a price at the amount it pays (list or
 * deal, flat or two-step). Found again by lookup_key, so it works with or without a deal row and
 * asking twice never makes two. A new word or a new amount makes a new price, never a silent change.
 */
async function wordedBranchPrice(
  companyId: string,
  deal: StoredDeal | null,
  word: BranchWord,
  key: string,
  interval: BillingInterval,
  amount: { unitPence: number } | { firstPence: number; after: number; restPence: number },
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const slug = word.one.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  const lookupKey = `bcc-${companyId}-${key}-${slug}`.slice(0, 200);
  const m = interval === "year" ? YEARLY_MONTHS_CHARGED : 1;
  try {
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    let id = found.data[0]?.id ?? null;
    if (!id) {
      const common = {
        currency: "gbp",
        product_data: { name: `Extra ${lower(word.one)}`, metadata: { company_id: companyId } },
        recurring: { interval, usage_type: "licensed" as const },
        lookup_key: lookupKey,
        nickname: `Company ${companyId.slice(0, 8)} ${key} (${word.one})`,
        metadata: { company_id: companyId, deal_key: key, branch_word: word.one },
      };
      const created =
        "unitPence" in amount
          ? await stripe.prices.create({ ...common, unit_amount: amount.unitPence * m }, { idempotencyKey: lookupKey })
          : await stripe.prices.create(
              {
                ...common,
                billing_scheme: "tiered",
                tiers_mode: "graduated",
                tiers: [
                  { up_to: amount.after, unit_amount: amount.firstPence * m },
                  { up_to: "inf", unit_amount: amount.restPence * m },
                ],
              },
              { idempotencyKey: lookupKey },
            );
      id = created.id;
    }
    // Kept with the deal too, where there is one, so an old line is still known as an extra.
    if (deal && deal.stripe_price_ids?.[`${key}:${slug}`] !== id) await remember(companyId, `${key}:${slug}`, id);
    return id;
  } catch (e) {
    console.error(`[billing] could not make the ${word.one} price ${key}:`, (e as Error).message);
    return null;
  }
}

/**
 * The plan, seat and branch prices for a company on a tier, for the intervals it pays. Makes any
 * special Stripe Prices its deal needs. Falls back to the list price only where the deal has none.
 */
export async function companyPrices(
  companyId: string,
  tier: SubscriptionTier,
  intervals: { plan: BillingInterval; extras: BillingInterval },
): Promise<CompanyPrices> {
  const deal = await readDeal(companyId);
  const prices = dealPrices(deal, { planPence: TIER_BASE_PENCE[tier], seatPence: EXTRA_SEAT_PENCE, branchPence: EXTRA_BRANCH_PENCE });
  const specialPlan = deal?.plan_price_pence != null && deal.plan_price_pence !== TIER_BASE_PENCE[tier];
  const specialSeat = deal?.seat_price_pence != null && deal.seat_price_pence !== EXTRA_SEAT_PENCE;
  const specialBranch =
    prices.step !== null || (deal?.branch_price_pence != null && deal.branch_price_pence !== EXTRA_BRANCH_PENCE);

  const listPlan = tierBasePriceId(tier, intervals.plan);
  const listSeat = seatPriceId(intervals.extras);
  const listBranch = branchPriceId(intervals.extras);
  const word = await readBranchWord(companyId);
  const customWord = word.one.toLowerCase() !== "branch";
  const branchKey = prices.step
    ? `branch:${intervals.extras}:${prices.branchPence}:${prices.step.after}:${prices.step.pricePence}`
    : `branch:${intervals.extras}:${prices.branchPence}`;
  const branchAmount = prices.step
    ? { firstPence: prices.branchPence, after: prices.step.after, restPence: prices.step.pricePence }
    : { unitPence: prices.branchPence };

  const plan =
    specialPlan && deal
      ? await specialPrice(companyId, deal, `plan:${tier}:${intervals.plan}:${prices.planPence}`, listPlan, intervals.plan, {
          unitPence: prices.planPence,
        })
      : listPlan;
  const seat =
    specialSeat && deal
      ? await specialPrice(companyId, deal, `seat:${intervals.extras}:${prices.seatPence}`, listSeat, intervals.extras, {
          unitPence: prices.seatPence,
        })
      : listSeat;
  const branch = customWord
    ? await wordedBranchPrice(companyId, deal, word, branchKey, intervals.extras, branchAmount)
    : specialBranch && deal
      ? await specialPrice(companyId, deal, branchKey, listBranch, intervals.extras, branchAmount)
      : listBranch;

  const stored = Object.entries((await readDeal(companyId))?.stripe_price_ids ?? {});
  const dealAddOns = stored.filter(([k]) => k.startsWith("seat:") || k.startsWith("branch:")).map(([, v]) => v);
  const dealBases = stored.filter(([k]) => k.startsWith("plan:")).map(([, v]) => v);
  const nonEmpty = (v: string | null | undefined): v is string => typeof v === "string" && v.length > 0;

  return {
    plan,
    seat,
    branch,
    addOnIds: [seatPriceId("month"), seatPriceId("year"), branchPriceId("month"), branchPriceId("year"), ...dealAddOns, seat, branch].filter(nonEmpty),
    baseIds: [...allBasePriceIds(), ...dealBases, plan].filter(nonEmpty),
    special: { plan: specialPlan, seat: specialSeat, branch: specialBranch || customWord },
  };
}

/** Does this company's deal set its own plan, extra user or extra branch price? (Used by the plan
 *  change, which must not carry a Business special price onto Pro, and by the webhook.) */
export async function dealSpecials(companyId: string): Promise<{ plan: boolean; seat: boolean; branch: boolean; seatPriceIds: string[] }> {
  const deal = await readDeal(companyId);
  const ids = Object.entries(deal?.stripe_price_ids ?? {});
  return {
    plan: deal?.plan_price_pence != null,
    seat: deal?.seat_price_pence != null,
    branch: deal?.branch_price_pence != null || deal?.branch_step_after != null,
    seatPriceIds: ids.filter(([k]) => k.startsWith("seat:")).map(([, v]) => v),
  };
}
