import "server-only";

/**
 * Be Care Compliant — changing a company's PLAN, in one place.
 *
 * Not to be confused with lib/billing/tier.ts, which answers "does this tier have this
 * feature". This file answers "move this company to that tier, and settle Stripe".
 *
 * Deliberately not a server action: it is imported by BOTH the founder control and the
 * customer's own upgrade, and a "use server" file may export only async functions. One
 * implementation means the two entry points cannot drift apart on what is allowed or on what
 * Stripe gets told. The rule itself is pure and unit tested in lib/billing/tier-change.ts.
 *
 * ORDER MATTERS, AND IT IS DELIBERATE: the tier is written FIRST, then Stripe is told.
 *
 * There is no atomic option across a database and a payment processor, so the choice is which
 * way to fail. Tier first means a failure leaves the company on the new plan paying the old
 * price: UNDERCHARGING, which this product has already decided is the safe direction (see
 * checkoutPriceProblem, which refuses a sale rather than charge an amount nobody was shown).
 * Stripe first would mean charging Pro for Business, which is the failure a customer notices on
 * their statement. And the nightly reconcile calls syncBasePrice, so the undercharging case
 * heals itself by morning rather than lasting for ever.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  tierChangePlan,
  label,
  isTierName,
  type Actor,
  type TierName,
} from "@/lib/billing/tier-change";
import {
  upsertCompanyBilling,
  syncBasePrice,
  syncSeatQuantity,
  syncBranchQuantity,
  endSubscriptionAtPeriodEnd,
  resumeSubscription,
  extraSeats,
  extraBranches,
  getActiveSeatCount,
} from "@/lib/billing/stripe-sync";
import { subscriptionHasEnded } from "@/lib/billing/subscription-state";
import { checkoutPriceProblem } from "@/lib/billing/price-check";
import { branchPriceId } from "@/lib/stripe/config";

export type TierChangeOutcome =
  | { ok: false; error: string }
  | {
      ok: true;
      from: TierName;
      to: TierName;
      /** True when Stripe was settled, or when there was nothing to settle. */
      billingSettled: boolean;
      /** What to show the person who pressed the button. */
      message: string;
    };

/**
 * Move a company to another plan and settle Stripe.
 *
 * Returns a refusal rather than throwing, so both callers can put it straight in front of
 * somebody. Every refusal names a reason a person can act on.
 */
export async function changeTier(input: {
  companyId: string;
  to: string;
  actor: Actor;
}): Promise<TierChangeOutcome> {
  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, tier")
    .eq("id", input.companyId)
    .maybeSingle();
  // A failed read and a missing row mean different things, and only one of them is the
  // founder's problem. Sending somebody to look for a company that has not gone anywhere is
  // its own small waste of an afternoon.
  if (companyError) {
    return { ok: false, error: "Could not read this company just now. Try again." };
  }
  if (!company) return { ok: false, error: "That company no longer exists." };

  const from = (company as { tier?: string }).tier ?? "";

  /* READ THE BILLING ROW HERE, WITH THE ERROR. getCompanyBilling returns null on a failed read
     as well as on a missing row, and the two mean opposite things at this point: a database
     blip would become "no subscription", which becomes "nothing to settle", which would move a
     paying company to Black and leave Stripe billing them for ever while telling the founder
     "there is no subscription to stop". Refusing on an unreadable row costs a retry. */
  const { data: billingRow, error: billingError } = await supabase
    .from("company_billing")
    .select("stripe_subscription_id, subscription_status")
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (billingError) {
    return { ok: false, error: "Could not read this company's billing just now. Try again." };
  }
  const billing = billingRow as
    | { stripe_subscription_id: string | null; subscription_status: string | null }
    | null;
  const hasLiveSubscription =
    Boolean(billing?.stripe_subscription_id) &&
    !subscriptionHasEnded(billing?.subscription_status);

  const plan = tierChangePlan({ from, to: input.to, actor: input.actor, hasLiveSubscription });
  if (!plan.allowed) return { ok: false, error: plan.reason };

  // Both are known good by now: tierChangePlan refuses anything else.
  if (!isTierName(from) || !isTierName(input.to)) {
    return { ok: false, error: "That is not a plan we sell." };
  }
  const fromTier: TierName = from;
  const toTier: TierName = input.to;

  /* THE PRICE GUARD, BEFORE ANYTHING MOVES. This is the guard that exists because Pro was once
     sold at £69 on the website and would have been charged at £99 by Stripe. The customer's own
     upgrade had it and the founder control did not, so the same company could be refused on one
     screen and silently moved onto a stale price on the other. It belongs here, where both
     entry points pass through, not in one of them.

     The seat and branch prices are checked only when a line will ACTUALLY be touched, and
     against the TARGET tier's allowances, because that is what the company is about to be on.
     Checking a price that is not going on the invoice would let a company be blocked by a line
     it is not being charged for, which is a mistake this guard has already made once. */
  if (plan.settlement === "swap_base" || plan.settlement === "resume") {
    const seatExtra = extraSeats(await getActiveSeatCount(input.companyId), toTier);
    const branchExtra = branchPriceId() ? await extraBranches(input.companyId, toTier) : 0;
    const priceProblem = await checkoutPriceProblem(toTier as "business" | "pro", {
      includeSeat: seatExtra > 0,
      includeBranch: branchExtra > 0,
    });
    if (priceProblem) return { ok: false, error: priceProblem };
  }

  // THE TIER FIRST. See the note at the top of this file for why this order and not the other.
  const { error: writeError } = await supabase
    .from("companies")
    .update({ tier: toTier })
    .eq("id", input.companyId);
  if (writeError) return { ok: false, error: writeError.message };

  /* AND billed_tier IN THE SAME BREATH, because syncSeatQuantity and syncBranchQuantity read
     THAT, not companies.tier. Leaving it behind was a real overcharge: a Business company with
     6 users upgrading to Pro would have had its extra seats recounted against the OLD allowance
     of 4, found them unchanged at 2, written nothing, and carried on charging £10 a month for
     two users Pro includes — until somebody happened to add or remove a user, because the
     nightly reconcile does not touch seats at all. The comment below used to claim this worked.
     Only written when a billing row already exists: creating one here for a company that has
     never paid would invent a billing record out of a plan change. */
  if (billing) {
    const { error: billedError } = await supabase
      .from("company_billing")
      .update({ billed_tier: toTier })
      .eq("company_id", input.companyId);
    if (billedError) {
      /* Refuse rather than carry on. The seat sync is about to read this column, and reading a
         stale one is not a near miss: a Business company with 6 users upgrading to Pro would
         recount its extra seats against the OLD allowance of 4, find them unchanged, write
         nothing, and keep charging £10 a month for two users Pro includes. The tier has already
         moved, which the message says, and the nightly reconcile now recounts seats. */
      return {
        ok: true,
        from: fromTier,
        to: toTier,
        billingSettled: false,
        message: `${(company as { name?: string }).name ?? "The company"} is now on ${label(toTier)}, but their billing record could not be updated, so Stripe has not been told yet. Tonight's billing reconcile will put it right.`,
      };
    }
  }

  let billingSettled = true;
  let settlementNote = "";

  if (plan.settlement === "cancel_at_period_end") {
    const stopped = await endSubscriptionAtPeriodEnd(input.companyId);
    billingSettled = stopped.ended;
    if (!stopped.ended) {
      settlementNote =
        " Their subscription could NOT be stopped in Stripe, so they are still being charged. Stop it in the Stripe dashboard.";
    }
  } else if (plan.settlement === "swap_base" || plan.settlement === "resume") {
    if (plan.settlement === "resume") {
      const resumed = await resumeSubscription(input.companyId);
      billingSettled = resumed.resumed;
      if (!resumed.resumed) {
        settlementNote =
          resumed.reason === "subscription_ended"
            ? " Their subscription had already stopped, so they will need to subscribe again from their billing page."
            : " The scheduled cancellation could NOT be called off in Stripe. Do it in the Stripe dashboard, or they will be cancelled at the end of this period.";
      }
    }

    const base = await syncBasePrice(input.companyId);
    if (!base.synced) {
      billingSettled = false;
      /* "Tonight's reconcile will correct it" is only true of a TRANSIENT failure. It is a lie
         for a subscription line carrying a price we do not recognise, for a missing price id,
         and for a subscription that has already ended: the reconcile runs the same code and
         fails the same way, every night, for ever. Saying so is the difference between somebody
         going to look at it and somebody waiting for a fix that is never coming. */
      settlementNote += permanent(base.reason)
        ? ` Their subscription could NOT be moved onto the new plan's price (${base.reason ?? "unknown"}), and this will not fix itself. Check the subscription in Stripe.`
        : " The subscription could NOT be updated in Stripe just now, so the new plan is running at the old price. Tonight's billing reconcile will correct it.";
    } else {
      /* The allowances move with the tier (Business 4 users and 1 branch, Pro 6 and 2), so the
         EXTRAS are recounted here or an upgrade would keep charging for seats and branches the
         new plan now includes. This works because billed_tier was written above. */
      await syncSeatQuantity(input.companyId);
      await syncBranchQuantity(input.companyId);
    }
  }

  return {
    ok: true,
    from: fromTier,
    to: toTier,
    billingSettled,
    message: `${(company as { name?: string }).name ?? "The company"} is now on ${label(toTier)}. ${plan.note}${settlementNote}`,
  };
}

/** Failures the nightly reconcile will hit in exactly the same way tomorrow night. */
function permanent(reason: string | undefined): boolean {
  return (
    reason === "base_item_ambiguous" ||
    reason === "base_item_none" ||
    reason === "unrecognised_price" ||
    reason === "no_base_price" ||
    reason === "subscription_ended" ||
    reason === "stripe_unconfigured"
  );
}
