import "server-only";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import {
  TIER_BASE_PENCE,
  TIER_LABELS,
  SUBSCRIPTION_TIERS,
  AI_TOPUP_PENCE,
  tierBasePriceId,
  seatPriceId,
  aiTopupPriceId,
  type SubscriptionTier,
} from "@/lib/stripe/config";
import { EXTRA_SEAT_PENCE } from "@/lib/billing/seats";
import { PRICING_TIERS } from "@/lib/marketing/tiers";

/**
 * Does Stripe charge what this application says it charges?
 *
 * WHY THIS EXISTS. On 2026-07-29 the public pricing page had said Pro was £69 for days
 * while Stripe still held the old £99 price and TIER_BASE_PENCE agreed with Stripe. Nothing
 * anywhere noticed, because the three places that hold a price have no way of comparing
 * notes: one is a marketing page, one is a TypeScript constant, and one is a Stripe object
 * created by hand in a dashboard. Nobody had subscribed, so the first customer to press
 * Subscribe would have been charged £30 a month more than the website promised them. The
 * trial lapse gate makes Subscribe the way OUT of a lapsed trial, so the first person to
 * press it is a customer who has just lost access, which is the worst possible moment to
 * overcharge somebody.
 *
 * A unit test (lib/billing/price-consistency.test.ts) keeps the marketing page and the
 * constants honest with each other. It cannot see Stripe, because Stripe is a live account
 * and a test has no key. So this is the other half: it asks Stripe what each configured
 * price actually is and reports any disagreement on the founder health screen.
 *
 * Read only. It never writes to Stripe, and a failure to read is reported rather than
 * assumed to be fine.
 */

export type PriceCheck = {
  label: string;
  env: string;
  /** What this application believes, in pence, excluding VAT. */
  expectedPence: number;
  /** What Stripe says, or null when the price could not be read. */
  actualPence: number | null;
  currency: string | null;
  cadence: string | null;
  /** True when Stripe agrees, or when this is simply not something we sell yet. */
  ok: boolean;
  /** Nothing configured at all. Neutral rather than wrong when the tier is not on sale. */
  notSetUp: boolean;
  note: string;
};

type Target = {
  label: string;
  env: string;
  priceId: string | null;
  expectedPence: number;
  /** Subscription prices must recur monthly; the top-up must be one time. */
  recurring: boolean;
  /** Is this something a customer can buy today? Taken from the public pricing page, so
   *  the two cannot drift. A tier nobody is sold has no price id and that is FINE: it is
   *  reported as Not set up rather than Wrong, because a health panel that is permanently
   *  red is a health panel nobody reads, which is the exact failure this feature exists to
   *  fix. Enterprise is the live example: it is a real tier a company can be put on by
   *  hand, but it is not on the pricing page. */
  onSale: boolean;
};

const PUBLIC_TIERS = new Set(PRICING_TIERS.map((t) => t.key as string));

function targets(): Target[] {
  const list: Target[] = SUBSCRIPTION_TIERS.map((tier: SubscriptionTier) => ({
    label: `${TIER_LABELS[tier]} plan, monthly base`,
    env: `STRIPE_PRICE_${tier.toUpperCase()}`,
    priceId: tierBasePriceId(tier),
    expectedPence: TIER_BASE_PENCE[tier],
    recurring: true,
    onSale: PUBLIC_TIERS.has(tier),
  }));
  list.push({
    label: "Extra user, per month",
    env: "STRIPE_PRICE_SEAT",
    priceId: seatPriceId(),
    expectedPence: EXTRA_SEAT_PENCE,
    recurring: true,
    onSale: true,
  });
  list.push({
    label: "AI credit top up, one time",
    env: "STRIPE_PRICE_AI_TOPUP",
    priceId: aiTopupPriceId(),
    expectedPence: AI_TOPUP_PENCE,
    recurring: false,
    onSale: true,
  });
  return list;
}

/** Null when Stripe is not configured at all: the health screen already says so. */
export async function checkStripePrices(): Promise<PriceCheck[] | null> {
  if (!stripeConfigured()) return null;
  const stripe = getStripe();
  if (!stripe) return null;

  const results: PriceCheck[] = [];
  for (const t of targets()) {
    if (!t.priceId) {
      results.push({
        label: t.label,
        env: t.env,
        expectedPence: t.expectedPence,
        actualPence: null,
        currency: null,
        cadence: null,
        ok: !t.onSale,
        notSetUp: true,
        note: t.onSale
          ? "No price id is set, so this cannot be sold at all."
          : "Not on the pricing page, so nothing to sell and nothing to check.",
      });
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(t.priceId);
      const actual = price.unit_amount ?? null;
      const currency = price.currency ?? null;
      const interval = price.recurring?.interval ?? null;
      const cadence = interval ? `every ${interval}` : "one time";

      const problems: string[] = [];
      if (actual !== t.expectedPence) {
        problems.push(
          `Stripe charges ${formatPence(actual)} but the app says ${formatPence(t.expectedPence)}`,
        );
      }
      if (currency !== "gbp") problems.push(`the currency is ${currency ?? "unknown"}, not GBP`);
      if (t.recurring && interval !== "month") {
        problems.push(`it recurs ${interval ?? "not at all"} rather than monthly`);
      }
      if (!t.recurring && interval !== null) problems.push("it recurs, and it should be one time");
      if (price.active === false) problems.push("the price is archived in Stripe");

      results.push({
        label: t.label,
        env: t.env,
        expectedPence: t.expectedPence,
        actualPence: actual,
        currency,
        cadence,
        ok: problems.length === 0,
        notSetUp: false,
        note: problems.length === 0 ? "Matches" : `${problems.join(", ")}.`,
      });
    } catch (e) {
      results.push({
        label: t.label,
        env: t.env,
        expectedPence: t.expectedPence,
        actualPence: null,
        currency: null,
        cadence: null,
        ok: false,
        notSetUp: false,
        note: `Stripe could not read that price: ${(e as Error).message}`,
      });
    }
  }
  return results;
}

/**
 * The last line before money changes hands.
 *
 * startCheckout calls this immediately before creating the Checkout Session, so a Price
 * whose amount disagrees with what this application has been telling the customer can never
 * be sold. That matters most in exactly the window this file was written for: the pricing
 * page and TIER_BASE_PENCE now both say £69, and if the Stripe Price is still the old £99
 * one, this refuses the sale in plain English rather than charging £30 a month too much.
 *
 * FAILS CLOSED ON A MISMATCH, OPEN ON A READ FAILURE. A price we can prove is wrong stops
 * the sale. A price we simply could not read does not, because a transient Stripe outage
 * must not stand between a customer and their own account, and a genuinely broken price id
 * makes Checkout itself fail a moment later anyway.
 */
export async function checkoutPriceProblem(
  tier: SubscriptionTier,
  opts: { includeSeat?: boolean } = {},
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  // Only check the seat price when a seat line is actually going on this invoice. A
  // company inside its included users never buys one, and refusing their subscription over
  // a price that would not appear on their bill would be the guard doing harm: they would
  // be locked out of a lapsed trial by a line item they are not being charged for.
  const wanted: Array<{ id: string | null; expected: number; what: string }> = [
    { id: tierBasePriceId(tier), expected: TIER_BASE_PENCE[tier], what: `the ${TIER_LABELS[tier]} plan` },
  ];
  if (opts.includeSeat) {
    wanted.push({ id: seatPriceId(), expected: EXTRA_SEAT_PENCE, what: "the extra user price" });
  }

  for (const w of wanted) {
    if (!w.id) continue;
    try {
      const price = await stripe.prices.retrieve(w.id);
      const actual = price.unit_amount ?? null;
      if (actual !== null && actual !== w.expected) {
        console.error(
          `[billing] price mismatch on ${w.id}: Stripe ${actual}, app ${w.expected}`,
        );
        return `We cannot take payment just now, because the price we hold for ${w.what} does not match the one shown to you. Nothing has been charged. Please email hello@becarecompliant.com and we will sort it out today.`;
      }
      if (price.currency && price.currency !== "gbp") {
        console.error(`[billing] price ${w.id} is in ${price.currency}, not gbp`);
        return "We cannot take payment just now, because the plan is set up in the wrong currency. Nothing has been charged. Please email hello@becarecompliant.com.";
      }
      if (price.active === false) {
        console.error(`[billing] price ${w.id} is archived in Stripe`);
        return "We cannot take payment just now, because the plan you are subscribing to has been retired and not replaced. Nothing has been charged. Please email hello@becarecompliant.com and we will sort it out today.";
      }
    } catch (e) {
      // Open on a read failure, on purpose. See the note above.
      console.error(`[billing] could not verify price ${w.id}:`, (e as Error).message);
    }
  }
  return null;
}

function formatPence(pence: number | null): string {
  if (pence === null) return "nothing";
  return `£${(pence / 100).toFixed(2)}`;
}
