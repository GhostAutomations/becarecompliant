import "server-only";

/**
 * Billing configuration for Be Care Compliant.
 *
 * Fixed product rules (not up for debate): every SUBSCRIPTION tier includes 4
 * users, then £5 per extra user per month. Diamond has no subscription and pays
 * usage only (SMS + AI). Black is free, founder-granted, and has NO Stripe
 * objects. Prices agreed with Phil 2026-07-12: Business £49, Pro £99,
 * Enterprise £199 per month (base), all GBP, monthly only, no trials.
 *
 * Stripe Price IDs are created in the Stripe dashboard (test mode first) and
 * supplied via env, so the numbers live in Stripe, not hard-coded here. This
 * file only maps a tier to its base Price ID and holds the single per-seat
 * Price ID shared by every subscription tier.
 */

export type Tier = "business" | "pro" | "enterprise" | "diamond" | "black";

/** Tiers that carry a Stripe subscription (base price + per-seat price). */
export const SUBSCRIPTION_TIERS = ["business", "pro", "enterprise"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export function isSubscriptionTier(tier: string): tier is SubscriptionTier {
  return (SUBSCRIPTION_TIERS as readonly string[]).includes(tier);
}

/** Human labels. No dashes anywhere in customer-facing copy. */
export const TIER_LABELS: Record<Tier, string> = {
  business: "Business",
  pro: "Pro",
  enterprise: "Enterprise",
  diamond: "Diamond",
  black: "Black",
};

/** Expected base price per subscription tier, in pence, for display + display-side reconciliation. */
export const TIER_BASE_PENCE: Record<SubscriptionTier, number> = {
  business: 4900,
  pro: 9900,
  enterprise: 19900,
};

/** The Stripe Price ID for each subscription tier's flat monthly base fee. */
export function tierBasePriceId(tier: SubscriptionTier): string | null {
  switch (tier) {
    case "business":
      return process.env.STRIPE_PRICE_BUSINESS ?? null;
    case "pro":
      return process.env.STRIPE_PRICE_PRO ?? null;
    case "enterprise":
      return process.env.STRIPE_PRICE_ENTERPRISE ?? null;
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

/**
 * Whether every price this tier needs is configured. The Checkout action uses
 * this to fail visibly ("billing not configured") rather than 500 on a missing
 * price id.
 */
export function tierPricingReady(tier: SubscriptionTier): boolean {
  return Boolean(tierBasePriceId(tier) && seatPriceId());
}

/**
 * Diamond usage rate per unit, in pence, from env. SMS unit = one message
 * segment; AI unit = one token. When a rate is set the monthly cron bills
 * units × rate; when it is unset it falls back to the metered cost_pence already
 * recorded on each usage_event (a pass-through of our own cost).
 *
 * NOTE (open decision, flag to Phil before the first live Diamond invoice): the
 * customer-facing per-unit price / markup is not finalised. These envs let us
 * set it without a code change once agreed.
 */
export function diamondRatePence(kind: "sms" | "ai"): number | null {
  const raw =
    kind === "sms"
      ? process.env.STRIPE_DIAMOND_SMS_PENCE
      : process.env.STRIPE_DIAMOND_AI_PENCE;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
