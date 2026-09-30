/**
 * MONTHLY OR ANNUAL, as a pure decision (Phil, 2026-09-30).
 *
 * The Order the Company Admin accepted says Monthly or Annual, and on Annual whether the extras
 * (extra users and extra branches) are paid yearly with the plan or monthly by card. This file
 * turns that into what Stripe is asked for, so the rules can be tested without Stripe.
 *
 *   Monthly           plan monthly, extras monthly, one Checkout as before.
 *   Annual, yearly    plan yearly, extras yearly (ten months' price for twelve), one Checkout.
 *   Annual, monthly   plan yearly in Checkout; the monthly extras are added to the SAME
 *                     subscription straight after, by the seat and branch sync (Stripe allows
 *                     mixed intervals in "flexible" billing mode, but not inside Checkout).
 *
 * Pure and importless so node --test runs it.
 */

export type Interval = "month" | "year";

export function intervalsFromOrder(
  order: { billing_option?: string | null; extras_billing?: string | null } | null | undefined,
): { plan: Interval; extras: Interval } {
  if (order?.billing_option !== "annual") return { plan: "month", extras: "month" };
  return { plan: "year", extras: order.extras_billing === "monthly" ? "month" : "year" };
}

export type LineItem = { price: string; quantity: number };

/**
 * The recurring lines for a Checkout Session. Extras go in only when they share the plan's
 * interval; otherwise `addExtrasAfter` says the sync must add them once the subscription exists.
 * A zero quantity is never a line (it would print "0 x £5.00 £0.00" on the invoice).
 */
export function checkoutLines(i: {
  basePriceId: string;
  seatPriceId: string | null;
  branchPriceId: string | null;
  extraSeats: number;
  extraBranches: number;
  plan: Interval;
  extras: Interval;
}): { lines: LineItem[]; addExtrasAfter: boolean } {
  const lines: LineItem[] = [{ price: i.basePriceId, quantity: 1 }];
  const sameInterval = i.plan === i.extras;
  const hasExtras = i.extraSeats > 0 || i.extraBranches > 0;
  if (sameInterval) {
    if (i.extraSeats > 0 && i.seatPriceId) lines.push({ price: i.seatPriceId, quantity: i.extraSeats });
    if (i.extraBranches > 0 && i.branchPriceId) lines.push({ price: i.branchPriceId, quantity: i.extraBranches });
  }
  return { lines, addExtrasAfter: !sameInterval && hasExtras };
}

/**
 * Is the onboarding fee charged on this first invoice? Only on a paid plan, only when the offer
 * that waives it did not apply on the day the Order was accepted, and only on a company's FIRST
 * subscription (a company that comes back after cancelling is not onboarded twice).
 */
export function onboardingDue(i: {
  tier: string | null | undefined;
  offerActiveOnStartDate: boolean;
  hadSubscriptionBefore: boolean;
}): boolean {
  if (i.tier === "black" || !i.tier) return false;
  if (i.offerActiveOnStartDate) return false;
  return !i.hadSubscriptionBefore;
}
