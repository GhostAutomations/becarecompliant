/**
 * Be Care Compliant — which subscription line is the PLAN, as opposed to the add-ons.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so the riskiest identification in the billing code can be
 * tested without Stripe.
 *
 * A subscription carries up to three lines: the tier's base price, the per-seat price and the
 * per-branch price. Changing a company's plan means rewriting the BASE line and nothing else,
 * and there is no flag on a Stripe item saying which is which. Picking "the first item" would
 * be wrong: item order is not promised, and rewriting the seat line's price would charge every
 * user at the plan price.
 *
 * So the base line is found by ELIMINATION, and the elimination has to be able to fail. If the
 * seat or branch price id is not configured, every line survives the filter and the answer is
 * ambiguous — which must refuse, not guess. Guessing here moves real money.
 */

export type PricedItem = { id: string; priceId: string | null | undefined };

export type BaseItemResult =
  | { ok: true; item: PricedItem }
  | { ok: false; reason: "none" | "ambiguous"; count: number };

/**
 * The one line that is neither the seat price nor the branch price.
 *
 * Returns a refusal rather than a best guess when there is not exactly one candidate: zero
 * means no plan line at all, more than one means something we did not create (or a price id
 * that has been rotated in Stripe while old subscriptions still carry the old one).
 */
export function pickBaseItem(
  items: readonly PricedItem[] | null | undefined,
  seatPriceId: string | null | undefined,
  branchPriceId: string | null | undefined,
): BaseItemResult {
  const addOns = new Set([seatPriceId, branchPriceId].filter(isNonEmpty));
  const candidates = (items ?? []).filter(
    (i) => i && isNonEmpty(i.priceId) && !addOns.has(i.priceId),
  );
  if (candidates.length === 1) return { ok: true, item: candidates[0] };
  return { ok: false, reason: candidates.length === 0 ? "none" : "ambiguous", count: candidates.length };
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type BaseSwapDecision =
  | { swap: true }
  | { swap: false; reason: "already_correct" | "unrecognised_price" };

/**
 * May this subscription's plan line be rewritten to `wanted`?
 *
 * ONLY WHEN THE LINE CARRIES A PRICE WE RECOGNISE AS SOME TIER'S BASE PRICE. That restriction
 * is the whole point, and it exists because of a real regression: the nightly reconcile was
 * given this job so that a tier change whose Stripe half failed would heal by morning, and as
 * first written it swapped whenever the price id merely DIFFERED from the configured one. That
 * turns an ordinary bit of admin — creating a new Price in Stripe and pointing the env var at
 * it, intending it for new customers — into a silent overnight migration of every existing
 * customer onto the new amount, prorated, with nothing on any screen saying so. It would also
 * have rewritten any grandfathered or negotiated price.
 *
 * "The line belongs to a tier the company is no longer on" is the condition we actually mean.
 * A price we do not recognise is somebody's deliberate arrangement; leave it alone and say so.
 */
export function baseSwapDecision(
  currentPriceId: string | null | undefined,
  wantedPriceId: string,
  knownTierPriceIds: readonly (string | null | undefined)[],
): BaseSwapDecision {
  if (currentPriceId === wantedPriceId) return { swap: false, reason: "already_correct" };
  const known = new Set(knownTierPriceIds.filter(isNonEmpty));
  if (!isNonEmpty(currentPriceId) || !known.has(currentPriceId)) {
    return { swap: false, reason: "unrecognised_price" };
  }
  return { swap: true };
}
