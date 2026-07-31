import "server-only";

/**
 * Billing configuration for Be Care Compliant.
 *
 * Fixed product rules (not up for debate): every SUBSCRIPTION tier includes 4
 * users, then £5 per extra user per month. Black is free, founder granted, and has NO Stripe
 * objects. Prices: Business £49, Pro £69 per month (base), all GBP, monthly only, no trials.
 *
 * Stripe Price IDs are created in the Stripe dashboard (test mode first) and
 * supplied via env, so the numbers live in Stripe, not hard-coded here. This
 * file only maps a tier to its base Price ID and holds the single per-seat
 * Price ID shared by every subscription tier.
 */

/**
 * THREE tiers (Phil, 2026-07-31): the two you sell, plus Black.
 *
 * Enterprise and Diamond are retired. The pricing page had been selling two plans for a while
 * whilst the code still carried five, which is how an SMS allowance came to be cut against tiers
 * nobody could buy. Black is the free, founder granted account: never sold, everything on.
 */
export type Tier = "business" | "pro" | "black";

/** Tiers that carry a Stripe subscription (base price + per-seat price). */
export const SUBSCRIPTION_TIERS = ["business", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export function isSubscriptionTier(tier: string): tier is SubscriptionTier {
  return (SUBSCRIPTION_TIERS as readonly string[]).includes(tier);
}

/** Human labels. No dashes anywhere in customer-facing copy. */
export const TIER_LABELS: Record<Tier, string> = {
  business: "Business",
  pro: "Pro",
  black: "Black",
};

/** Expected base price per subscription tier, in pence, for display + display-side reconciliation. */
export const TIER_BASE_PENCE: Record<SubscriptionTier, number> = {
  business: 4900,
  // £69, not the original £99. The two public tiers were re-cut and the pricing page was
  // rewritten, but this constant and the Stripe Price were both left on the old number, so
  // for days the website promised £69 while the app said £99 and Stripe would have charged
  // £99. Nothing caught it because a marketing file and a config file have no way of
  // comparing notes; lib/billing/price-consistency.test.ts now makes them, and
  // checkoutPriceProblem() refuses a sale outright if Stripe disagrees with this number.
  pro: 6900,
};

/** The Stripe Price ID for each subscription tier's flat monthly base fee. */
export function tierBasePriceId(tier: SubscriptionTier): string | null {
  switch (tier) {
    case "business":
      return process.env.STRIPE_PRICE_BUSINESS ?? null;
    case "pro":
      return process.env.STRIPE_PRICE_PRO ?? null;
  }
}

/**
 * The single per-seat Price ID (£5/user/month, licensed usage_type) shared by
 * all subscription tiers. Its quantity carries the number of EXTRA seats, i.e.
 * max(0, active users − 4). See lib/billing/seats.ts and stripe-sync.ts.
 */
export function seatPriceId(): string | null {
  return process.env.STRIPE_PRICE_SEAT ?? null;
}

/** AI credit top-up: a one-time payment for a bundle of credits. The Stripe Price
 *  (£10 + VAT, one time) is created in the dashboard and supplied via env; each unit
 *  purchased grants AI_TOPUP_CREDITS credits, which carry over until used. */
export const AI_TOPUP_CREDITS = 100;
/** What one top-up bundle costs, in pence, excluding VAT. It was only ever a comment
 *  until now, which is exactly how the Pro base price drifted to £30 out from the public
 *  pricing page without anything noticing. A number in code can be checked; prose cannot. */
export const AI_TOPUP_PENCE = 1000;
export function aiTopupPriceId(): string | null {
  return process.env.STRIPE_PRICE_AI_TOPUP ?? null;
}

/**
 * SMS top up: a one time payment for a bundle of texts, the same shape as the AI top up.
 *
 * 250 texts for £20 excluding VAT, which is 8p a text against a UK send cost of about 4p. The
 * monthly allowance by tier is Business 0, Pro 100, Black 2000
 * (tier_monthly_sms_credits in migration 0159); this is what a company buys when it runs out.
 *
 * The Stripe Price is created in the dashboard and supplied via env. These constants must match
 * it: a number in code can be checked, and the last time a price lived only in prose the Pro tier
 * drifted £30 out from the public page without anything noticing.
 */
export const SMS_TOPUP_CREDITS = 250;
export const SMS_TOPUP_PENCE = 2000;
export function smsTopupPriceId(): string | null {
  return process.env.STRIPE_PRICE_SMS_TOPUP ?? null;
}

/**
 * Whether every price this tier needs is configured. The Checkout action uses
 * this to fail visibly ("billing not configured") rather than 500 on a missing
 * price id.
 */
export function tierPricingReady(tier: SubscriptionTier): boolean {
  return Boolean(tierBasePriceId(tier) && seatPriceId());
}

