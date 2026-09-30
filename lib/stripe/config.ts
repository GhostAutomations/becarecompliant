import "server-only";

/**
 * Billing configuration for Be Care Compliant.
 *
 * Fixed product rules (not up for debate): every SUBSCRIPTION tier includes 4
 * users, then £5 per extra user per month. Black is free, founder granted, and has NO Stripe
 * objects. Prices: Business £79, Pro £129 per month (base, from 2026-09-29), all GBP, monthly only, no trials.
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
  // Raised 2026-09-29 (Phil): £49 to £79 and £69 to £129. The Stripe Prices must be replaced
  // to match, or checkoutPriceProblem() refuses the sale; the founder health panel shows which.
  business: 7900,
  // £69, not the original £99. The two public tiers were re-cut and the pricing page was
  // rewritten, but this constant and the Stripe Price were both left on the old number, so
  // for days the website promised £69 while the app said £99 and Stripe would have charged
  // £99. Nothing caught it because a marketing file and a config file have no way of
  // comparing notes; lib/billing/price-consistency.test.ts now makes them, and
  // checkoutPriceProblem() refuses a sale outright if Stripe disagrees with this number.
  pro: 12900,
};

/**
 * MONTHLY OR ANNUAL (Phil, 2026-09-30). Annual is the same plan paid yearly at ten months' price
 * for twelve, by card through Stripe by default or by Stripe invoice on request. Every price
 * below therefore has a yearly twin, created in Stripe and supplied through its own env var,
 * exactly like the monthly ones. The extras can be yearly too (same ten for twelve) or stay
 * monthly on an Annual plan, on the SAME subscription (Stripe "flexible" billing mode allows
 * mixed intervals), so seats and branches are looked up by the interval the company chose.
 */
export type BillingInterval = "month" | "year";

export function isBillingInterval(v: unknown): v is BillingInterval {
  return v === "month" || v === "year";
}

/** Months charged for a year on Annual: ten months' price for twelve. Kept in step with
 *  ANNUAL_MONTHS_CHARGED in lib/billing/allowances.ts by price-consistency.test.ts. */
export const YEARLY_MONTHS_CHARGED = 10;

/** The Stripe Price ID for each subscription tier's flat base fee, monthly or yearly. */
export function tierBasePriceId(tier: SubscriptionTier, interval: BillingInterval = "month"): string | null {
  const yearly = interval === "year";
  switch (tier) {
    case "business":
      return (yearly ? process.env.STRIPE_PRICE_BUSINESS_YEARLY : process.env.STRIPE_PRICE_BUSINESS) ?? null;
    case "pro":
      return (yearly ? process.env.STRIPE_PRICE_PRO_YEARLY : process.env.STRIPE_PRICE_PRO) ?? null;
  }
}

/** Every base price we created, monthly and yearly: the plan lines we may recognise and swap. */
export function allBasePriceIds(): Array<string | null> {
  return SUBSCRIPTION_TIERS.flatMap((t) => [tierBasePriceId(t, "month"), tierBasePriceId(t, "year")]);
}

/** Every add-on price, monthly and yearly: the lines that are never the plan. */
export function allAddOnPriceIds(): Array<string | null> {
  return [seatPriceId("month"), seatPriceId("year"), branchPriceId("month"), branchPriceId("year")];
}

/**
 * The single per-seat Price ID (£5/user/month, licensed usage_type) shared by
 * all subscription tiers. Its quantity carries the number of EXTRA seats, i.e.
 * max(0, active users − 4). See lib/billing/seats.ts and stripe-sync.ts.
 */
export function seatPriceId(interval: BillingInterval = "month"): string | null {
  return (interval === "year" ? process.env.STRIPE_PRICE_SEAT_YEARLY : process.env.STRIPE_PRICE_SEAT) ?? null;
}

/**
 * The per EXTRA BRANCH Price ID (£25/branch/month from 2026-09-29, £7.50 before), the same shape as the seat price: one
 * price shared by every subscription tier, whose QUANTITY carries the branches beyond the
 * tier's allowance (Business 1, Pro 2). See lib/billing/seats.ts includedBranchesForTier and
 * stripe-sync.ts syncBranchQuantity.
 *
 * THE LIST item 16: the pricing page has promised "£7.50 per extra branch per month" since
 * launch and nothing has ever billed for it. EXTRA_BRANCH_PENCE existed only to be printed.
 * Acme is the live example: Pro, two included, three operational branches, £7.50 a month shown
 * and never collected.
 */
export function branchPriceId(interval: BillingInterval = "month"): string | null {
  return (interval === "year" ? process.env.STRIPE_PRICE_BRANCH_YEARLY : process.env.STRIPE_PRICE_BRANCH) ?? null;
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
export function tierPricingReady(
  tier: SubscriptionTier,
  interval: BillingInterval = "month",
  extrasInterval: BillingInterval = interval,
): boolean {
  return Boolean(tierBasePriceId(tier, interval) && seatPriceId(extrasInterval));
}

