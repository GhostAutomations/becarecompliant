/**
 * Be Care Compliant — what a change of tier is allowed to do, and what Stripe must be told.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so the rule is unit testable and the founder control and the
 * customer's own upgrade cannot drift apart.
 *
 * WHY IT EXISTS. Until 2026-08-13 a company's tier was written at creation and by trial
 * provisioning AND BY NOTHING ELSE. No founder control, no customer control. So no Business
 * customer could ever upgrade to Pro, and moving a company onto Black meant hand-written SQL
 * with nothing to stop Stripe carrying on charging a company that is supposed to be free.
 *
 * THE APP IS UPSTREAM OF STRIPE HERE. The webhook copies billed_tier FROM companies.tier; it
 * never derives the tier from the price. So a plan changed in the Stripe portal would not move
 * the tier, and this rule is the only place a tier legitimately changes.
 */

export type TierName = "business" | "pro" | "black";
export type Actor = "founder" | "company_admin";

/** What Stripe has to be told when the tier moves. */
export type StripeSettlement =
  /** Swap the subscription's base price to the new tier's, prorated. */
  | "swap_base"
  /** Let the subscription run to the end of the period they have already paid for, then stop. */
  | "cancel_at_period_end"
  /** Call off a scheduled cancellation and put the base price back. Only reachable in the
   *  window after a move to Black, while the paid-for period is still running. */
  | "resume"
  /** Nothing to do: there is no subscription, or the move does not touch one. */
  | "none";

export type TierChangePlan =
  | { allowed: true; settlement: StripeSettlement; note: string }
  | { allowed: false; reason: string };

const TIERS: TierName[] = ["business", "pro", "black"];

export function isTierName(value: unknown): value is TierName {
  return typeof value === "string" && (TIERS as string[]).includes(value);
}

/**
 * Can this actor move this company from `from` to `to`, and what happens to Stripe?
 *
 * DOWNGRADES ARE DELIBERATELY NOT BUILT (Phil, 2026-08-13: "not yet, upgrades only"). The
 * reason is worth keeping: Pro includes 6 users and 2 branches against Business's 4 and 1, so a
 * company with 6 users and 2 branches would save £20 on the base and pay £17.50 more in extras.
 * A downgrade that barely reduces the bill needs the new total shown before it is agreed, and
 * that screen does not exist yet. Refusing is honest; doing it quietly is not.
 */
export function tierChangePlan(input: {
  from: string;
  to: string;
  actor: Actor;
  /** True when the company has a Stripe subscription that has not ended. */
  hasLiveSubscription: boolean;
}): TierChangePlan {
  const { from, to, actor, hasLiveSubscription } = input;

  if (!isTierName(to)) return { allowed: false, reason: "That is not a plan we sell." };
  if (!isTierName(from)) {
    // An unknown current tier is a data problem, not a customer problem. Refuse rather than
    // guess: guessing here moves real money.
    return { allowed: false, reason: "This company is on an unrecognised plan. Check it first." };
  }
  if (from === to) {
    return { allowed: false, reason: `They are already on ${label(to)}.` };
  }

  // Black is founder granted and free. A company can never put ITSELF on it, or off it.
  if (to === "black" && actor !== "founder") {
    return { allowed: false, reason: "Only the founder can put a company on Black." };
  }
  if (from === "black" && actor !== "founder") {
    return { allowed: false, reason: "Only the founder can move a company off Black." };
  }

  if (to === "black") {
    return {
      allowed: true,
      settlement: hasLiveSubscription ? "cancel_at_period_end" : "none",
      note: hasLiveSubscription
        ? "Black starts now. Their subscription stops at the end of the period they have already paid for, so no money moves in either direction."
        : "Black starts now. There is no subscription to stop.",
    };
  }

  if (from === "black") {
    /* A Black company USUALLY has no subscription, so there is nothing to swap and they
       subscribe through Checkout like anybody else, which is also what collects a card.

       But not always, and the exception is the one that loses money. Moving TO Black cancels at
       period end rather than immediately, so for up to a month a Black company still has a live
       subscription that is scheduled to stop. Undoing a mistake inside that window has to call
       the cancellation OFF and put the base price back. The first version of this rule returned
       "none" unconditionally, which would have told the founder "nothing is charged" about a
       company that was still being charged, and then silently cancelled them a few weeks later
       while they sat on a paid plan with everything unlocked. */
    return hasLiveSubscription
      ? {
          allowed: true,
          settlement: "resume",
          note: `Their subscription was due to stop at the end of this period. That is called off and they carry on on ${label(to)}.`,
        }
      : {
          allowed: true,
          settlement: "none",
          note: `They move to ${label(to)} now, but nothing is charged until they subscribe from their billing page. Black companies have no card on file.`,
        };
  }

  if (from === "pro" && to === "business") {
    return {
      allowed: false,
      reason:
        "Moving down from Pro is not built yet. Pro includes more users and branches, so the extras bill would rise as the base fell, and nobody should agree to that without seeing the new total.",
    };
  }

  // The only remaining case: business to pro.
  return {
    allowed: true,
    settlement: hasLiveSubscription ? "swap_base" : "none",
    note: hasLiveSubscription
      ? "Pro starts now and the difference is prorated onto their next invoice. Pro also includes more users and branches, so their extras may fall."
      : "Pro starts now. There is no subscription yet, so nothing is charged until they subscribe.",
  };
}

/** Customer-facing plan name. */
export function label(tier: TierName): string {
  switch (tier) {
    case "business":
      return "Business";
    case "pro":
      return "Pro";
    case "black":
      return "Black";
  }
}
