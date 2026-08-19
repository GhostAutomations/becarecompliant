import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import {
  seatPriceId,
  branchPriceId,
  tierBasePriceId,
  isSubscriptionTier,
} from "@/lib/stripe/config";
import { includedSeatsForTier, includedBranchesForTier, NON_BILLABLE_ROLES } from "@/lib/billing/seats";
import { customerIdentityPatch } from "@/lib/billing/customer-identity";
import { isTierName, type TierName } from "@/lib/billing/tier-change";
import { pickBaseItem, baseSwapDecision } from "@/lib/billing/base-item";
import { subscriptionHasEnded } from "@/lib/billing/subscription-state";

/**
 * Exact seat sync to Stripe. Product rule: 4 users included, then £5/extra/mo.
 * The per-seat Price on the subscription carries quantity = max(0, active − 4).
 * Adding a 5th user starts billing; removing them stops it. Proration is
 * create_prorations (Stripe default), so a mid-month change lands on the next
 * invoice.
 *
 * All functions here use the SERVICE-ROLE client and are best-effort: a Stripe
 * hiccup must never block the underlying user action (invite accept, etc.), so
 * failures are logged, not thrown (mirrors recordUsage / writeAudit).
 */

export type CompanyBillingRow = {
  company_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  billed_tier: string | null;
  seat_quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/** Live active-seat count for a company (service role; bypasses the guarded RPC). */
export async function getActiveSeatCount(companyId: string): Promise<number> {
  const supabase = createServiceClient();
  // Staff (Team Member) logins are free, so they must never reach the Stripe
  // quantity. This has to match company_active_user_count and every founder
  // screen, or the invoice says one thing and the app says another.
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active")
    .not("role", "in", `(${NON_BILLABLE_ROLES.join(",")})`);
  if (error) {
    console.error("[billing] seat count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Extra billable seats = users beyond the tier's included allowance (Business 4,
 *  Pro 6). Never negative. */
export function extraSeats(activeUsers: number, tier: string = "business"): number {
  return Math.max(0, activeUsers - includedSeatsForTier(tier));
}

/** Read the company_billing row, or null when the company has never billed. */
export async function getCompanyBilling(
  companyId: string,
): Promise<CompanyBillingRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("company_billing")
    .select(
      "company_id, stripe_customer_id, stripe_subscription_id, subscription_status, billed_tier, seat_quantity, current_period_end, cancel_at_period_end",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as CompanyBillingRow | null) ?? null;
}

/** Upsert selected fields onto company_billing (service role). */
export async function upsertCompanyBilling(
  companyId: string,
  patch: Partial<Omit<CompanyBillingRow, "company_id">>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("company_billing")
    .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
  if (error) console.error("[billing] upsert failed:", error.message);
}

/**
 * Ensure a Stripe Customer exists for the company and return its id, or null if
 * Stripe is not configured. Stores the id on company_billing.
 *
 * ALSO CORRECTS A STALE NAME. The customer record is written once, at the first checkout,
 * and Stripe is what prints on the invoice, the receipt and the card statement. A company
 * that renames therefore kept its old name on every future invoice for ever.
 *
 * Acme is the live example: Phil set it up as "Thistle Care Wales" and renamed it in BCC, and
 * the Stripe customer still said Thistle Care Wales a month later. In the care sector this is
 * not cosmetic — an agency that rebrands, or is bought, needs the invoice to carry the name it
 * files accounts under.
 *
 * Best effort by design: a rename that cannot be pushed must never stop somebody subscribing.
 */
export async function ensureCustomer(
  companyId: string,
  opts?: { name?: string; email?: string },
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const existing = await getCompanyBilling(companyId);
  if (existing?.stripe_customer_id) {
    await refreshCustomerIdentity(existing.stripe_customer_id, opts);
    return existing.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    name: opts?.name,
    email: opts?.email,
    metadata: { company_id: companyId },
  });
  await upsertCompanyBilling(companyId, { stripe_customer_id: customer.id });
  return customer.id;
}

/**
 * Push a changed company name or billing email onto an existing Stripe customer.
 *
 * Writes only when something actually differs, so the ordinary case costs one read and no
 * write. Never throws: every caller is in the middle of doing something the user asked for,
 * and none of them should fail because Stripe was briefly unreachable.
 */
export async function refreshCustomerIdentity(
  customerId: string,
  opts?: { name?: string; email?: string },
): Promise<void> {
  const name = opts?.name?.trim();
  const email = opts?.email?.trim();
  if (!name && !email) return;

  try {
    const stripe = getStripe();
    if (!stripe) return;

    const customer = await stripe.customers.retrieve(customerId);
    // A customer deleted in the Stripe dashboard comes back as { deleted: true } with no
    // fields. Updating it would throw; leaving it alone lets checkout fail loudly instead.
    if (!customer || (customer as { deleted?: boolean }).deleted) return;

    const patch = customerIdentityPatch(
      customer as { name?: string | null; email?: string | null },
      { name, email },
    );
    // Null means nothing differs, so the ordinary checkout costs one read and no write.
    if (!patch) return;

    await stripe.customers.update(customerId, patch);
  } catch (e) {
    console.error("[billing] customer identity refresh failed:", (e as Error).message);
  }
}

/**
 * Push the current extra-seat count onto the company's live subscription.
 * No-op (returns a reason) when: Stripe unset, no subscription, tier is not a
 * subscription tier (Black), or the quantity already matches. Never
 * throws.
 */
export async function syncSeatQuantity(
  companyId: string,
): Promise<{ synced: boolean; reason?: string; quantity?: number }> {
  try {
    const stripe = getStripe();
    if (!stripe) return { synced: false, reason: "stripe_unconfigured" };

    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) {
      return { synced: false, reason: "no_subscription" };
    }
    if (subscriptionHasEnded(billing.subscription_status)) {
      // A cancelled subscription is not a billing failure. Without this it would be
      // retried and refused by Stripe every night, logged as an error, and the one night
      // something real broke would look exactly the same.
      return { synced: false, reason: "subscription_ended" };
    }
    if (billing.billed_tier && !isSubscriptionTier(billing.billed_tier)) {
      return { synced: false, reason: "not_subscription_tier" };
    }

    const seatPrice = seatPriceId();
    if (!seatPrice) return { synced: false, reason: "no_seat_price" };

    const active = await getActiveSeatCount(companyId);
    const quantity = extraSeats(active, billing.billed_tier ?? "business");

    const subscription = await stripe.subscriptions.retrieve(
      billing.stripe_subscription_id,
    );
    const seatItem = subscription.items.data.find(
      (i) => i.price?.id === seatPrice,
    );

    if (!seatItem) {
      /* NOTHING TO ADD WHEN THERE IS NOTHING TO CHARGE FOR. The branch sync has always had this
         guard and the seat sync never did, which did not matter while this only ran when a user
         was added — there was always a seat to bill. Now that a plan change and the nightly
         reconcile call it, it fires on subscriptions with nobody over the allowance, and it put
         "Extra Seat 0 × £5.00 = £0.00" straight onto a real invoice. Seen on Acme, 13 Aug. */
      if (quantity === 0) return { synced: true, reason: "nothing_to_bill", quantity };
      await stripe.subscriptionItems.create({
        subscription: billing.stripe_subscription_id,
        price: seatPrice,
        quantity,
        proration_behavior: "create_prorations",
      });
    } else if (quantity === 0 && subscription.items.data.length > 1) {
      /* The line has fallen to nothing, so REMOVE it rather than leave a zero on the invoice.
         Setting the quantity to 0 would print "Extra Seat 0 × £5.00 £0.00" on every invoice for
         ever, which reads like a mistake even though the total is right. Only when something
         else remains: a subscription cannot have no items at all. */
      await stripe.subscriptionItems.del(seatItem.id, {
        proration_behavior: "create_prorations",
      });
    } else if ((seatItem.quantity ?? 0) !== quantity) {
      await stripe.subscriptionItems.update(seatItem.id, {
        quantity,
        proration_behavior: "create_prorations",
      });
    } else {
      // Already correct: still record for display, no Stripe write.
      if (billing.seat_quantity !== quantity) {
        await upsertCompanyBilling(companyId, { seat_quantity: quantity });
      }
      return { synced: true, reason: "unchanged", quantity };
    }

    await upsertCompanyBilling(companyId, { seat_quantity: quantity });
    return { synced: true, quantity };
  } catch (e) {
    console.error("[billing] seat sync failed:", (e as Error).message);
    return { synced: false, reason: "error" };
  }
}


/* ===========================================================================
 * THE BASE PRICE — keeping the subscription on the plan the app says they are on.
 *
 * The app is UPSTREAM of Stripe: the webhook copies billed_tier FROM companies.tier and never
 * derives the tier from the price. So when the tier moves, something has to move the base
 * price too, or the company is on Pro and paying for Business for ever.
 * =========================================================================== */

/**
 * Make the subscription's base line match the company's tier, prorated.
 *
 * Best effort by the same contract as the seat and branch syncs: a Stripe hiccup is logged and
 * reported, never thrown, so changing somebody's plan can never half-fail in a way that leaves
 * the founder unsure whether it happened.
 *
 * ALSO THE SELF-HEAL. The nightly reconcile calls this, so a tier change whose Stripe half
 * failed corrects itself by morning instead of silently undercharging for ever. That mattered
 * enough to build: without it, the only witness to the failure was a log line.
 */
export async function syncBasePrice(
  companyId: string,
): Promise<{ synced: boolean; reason?: string; tier?: string }> {
  try {
    const stripe = getStripe();
    if (!stripe) return { synced: false, reason: "stripe_unconfigured" };

    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) return { synced: false, reason: "no_subscription" };
    if (subscriptionHasEnded(billing.subscription_status)) {
      return { synced: false, reason: "subscription_ended" };
    }

    const tier = await companyTierName(companyId);
    if (!tier) return { synced: false, reason: "unknown_tier" };
    if (!isSubscriptionTier(tier)) {
      // Black. The subscription is being cancelled at period end by the tier change itself;
      // there is no base price to move it to, and swapping one in would start charging a
      // company that is supposed to be free.
      return { synced: false, reason: "not_subscription_tier", tier };
    }

    const wanted = tierBasePriceId(tier);
    if (!wanted) return { synced: false, reason: "no_base_price", tier };

    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);

    // Which line is the plan is decided by lib/billing/base-item.ts, which refuses rather than
    // guesses. See that file: with an add-on price id unconfigured, NOTHING is excluded and
    // every line looks like a plan line, so a "best guess" would rewrite the seat line's price
    // and charge every user the plan price.
    const found = pickBaseItem(
      subscription.items.data.map((i) => ({ id: i.id, priceId: i.price?.id })),
      seatPriceId(),
      branchPriceId(),
    );
    if (!found.ok) {
      console.error(
        `[billing] base price sync ${found.reason} (${found.count} candidates) on ${billing.stripe_subscription_id}`,
      );
      return { synced: false, reason: `base_item_${found.reason}`, tier };
    }

    /* Only a line carrying a price we recognise as some tier's base price may be rewritten.
       See lib/billing/base-item.ts: swapping on "the id differs" would turn pointing an env var
       at a new Stripe Price into an overnight migration of every existing customer onto it. */
    const decision = baseSwapDecision(found.item.priceId, wanted, [
      tierBasePriceId("business"),
      tierBasePriceId("pro"),
    ]);
    if (!decision.swap) {
      if (decision.reason === "unrecognised_price") {
        console.error(
          `[billing] base price on ${billing.stripe_subscription_id} is not a tier price; leaving it alone`,
        );
      }
      return { synced: decision.reason === "already_correct", reason: decision.reason, tier };
    }

    await stripe.subscriptionItems.update(found.item.id, {
      price: wanted,
      quantity: 1,
      proration_behavior: "create_prorations",
    });
    return { synced: true, tier };
  } catch (e) {
    console.error("[billing] base price sync failed:", (e as Error).message);
    return { synced: false, reason: "error" };
  }
}

/** Stop billing at the end of the period already paid for. Used when a company moves to Black:
 *  they keep what they bought, nothing is refunded, and no money moves in either direction. */
export async function endSubscriptionAtPeriodEnd(
  companyId: string,
): Promise<{ ended: boolean; reason?: string }> {
  try {
    const stripe = getStripe();
    if (!stripe) return { ended: false, reason: "stripe_unconfigured" };

    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) return { ended: false, reason: "no_subscription" };
    if (subscriptionHasEnded(billing.subscription_status)) {
      return { ended: true, reason: "already_ended" };
    }

    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    // The webhook writes cancel_at_period_end back, but the founder should not have to wait for
    // a round trip to see that it worked.
    await upsertCompanyBilling(companyId, { cancel_at_period_end: true });
    return { ended: true };
  } catch (e) {
    console.error("[billing] cancel at period end failed:", (e as Error).message);
    return { ended: false, reason: "error" };
  }
}

/**
 * Call off a scheduled cancellation.
 *
 * Reachable only in the window after a move to Black, while the period already paid for is
 * still running. Without this, undoing that move left the subscription still scheduled to stop:
 * the company would sit on a paid plan with everything unlocked, get cancelled weeks later, and
 * no screen anywhere would say so.
 */
export async function resumeSubscription(
  companyId: string,
): Promise<{ resumed: boolean; reason?: string }> {
  try {
    const stripe = getStripe();
    if (!stripe) return { resumed: false, reason: "stripe_unconfigured" };

    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) return { resumed: false, reason: "no_subscription" };
    if (subscriptionHasEnded(billing.subscription_status)) {
      // Too late: it has already stopped. They subscribe again through Checkout, which is also
      // what collects a card. Saying so beats pretending it worked.
      return { resumed: false, reason: "subscription_ended" };
    }

    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    await upsertCompanyBilling(companyId, { cancel_at_period_end: false });
    return { resumed: true };
  } catch (e) {
    console.error("[billing] resume subscription failed:", (e as Error).message);
    return { resumed: false, reason: "error" };
  }
}

/**
 * Schedule the cancellation of a subscription belonging to a company that is no longer on a
 * paid plan. Returns true only when it actually changed something, so the reconcile does not
 * report work it did not do.
 */
async function stopBillingAFreeCompany(companyId: string): Promise<boolean> {
  try {
    const stripe = getStripe();
    if (!stripe) return false;
    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) return false;
    if (subscriptionHasEnded(billing.subscription_status)) return false;
    if (billing.cancel_at_period_end) return false; // already on its way out

    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    if (subscription.cancel_at_period_end) {
      // Stripe already knows; our copy was just stale.
      await upsertCompanyBilling(companyId, { cancel_at_period_end: true });
      return false;
    }

    console.error(
      `[billing] company ${companyId} is on a free tier but still billing; scheduling cancellation`,
    );
    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    await upsertCompanyBilling(companyId, { cancel_at_period_end: true });
    return true;
  } catch (e) {
    console.error("[billing] could not stop billing a free company:", (e as Error).message);
    return false;
  }
}

/** The company's tier as a known TierName, or null when it is something we do not sell. */
async function companyTierName(companyId: string): Promise<TierName | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("companies")
    .select("tier")
    .eq("id", companyId)
    .maybeSingle();
  const tier = (data as { tier?: string } | null)?.tier;
  return isTierName(tier) ? tier : null;
}


/* ===========================================================================
 * EXTRA BRANCHES (THE LIST item 16).
 *
 * The pricing page has promised "£7.50 per extra branch per month" since launch and NOTHING
 * HAS EVER BILLED FOR IT. EXTRA_BRANCH_PENCE existed only to be printed on a settings screen.
 * Acme is the live example: Pro, two included, three operational branches, £7.50 a month shown
 * to the customer and never collected.
 *
 * Deliberately the SAME SHAPE as seats rather than a second billing mechanism: one price on
 * the subscription whose quantity is "beyond the allowance", pushed whenever the count
 * changes, prorated onto the next invoice. Anyone who understands the seat model already
 * understands this one, and there is one place to look when a bill is questioned.
 *
 * Branches are FOUNDER provisioned, so in practice this bills when Phil adds a branch for a
 * customer. That is the moment the customer has to have been told; the code cannot know
 * whether they were.
 * =========================================================================== */

/** Operational branches (kind = 'branch'); the office/team row is not a branch and is never
 *  billed. Service role: this runs inside founder actions and cron paths. */
export async function getBranchCount(companyId: string): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("kind", "branch");
  if (error) {
    console.error("[billing] branch count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Branches beyond the tier's allowance (Business 1, Pro 2). Never negative. */
export function extraBranchesFor(branches: number, tier: string = "business"): number {
  return Math.max(0, branches - includedBranchesForTier(tier));
}

/** Live extra-branch count for a company. */
export async function extraBranches(companyId: string, tier: string): Promise<number> {
  return extraBranchesFor(await getBranchCount(companyId), tier);
}

/**
 * Push the extra-branch quantity to Stripe. Mirrors syncSeatQuantity exactly, including its
 * best-effort contract: a Stripe hiccup is logged, never thrown, so provisioning a branch for
 * a customer can never fail because billing was briefly unreachable.
 */
export async function syncBranchQuantity(
  companyId: string,
): Promise<{ synced: boolean; reason?: string; quantity?: number }> {
  try {
    const stripe = getStripe();
    if (!stripe) return { synced: false, reason: "stripe_unconfigured" };

    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) {
      return { synced: false, reason: "no_subscription" };
    }
    if (subscriptionHasEnded(billing.subscription_status)) {
      // A cancelled subscription is not a billing failure. Without this it would be
      // retried and refused by Stripe every night, logged as an error, and the one night
      // something real broke would look exactly the same.
      return { synced: false, reason: "subscription_ended" };
    }
    if (billing.billed_tier && !isSubscriptionTier(billing.billed_tier)) {
      return { synced: false, reason: "not_subscription_tier" };
    }

    const price = branchPriceId();
    if (!price) return { synced: false, reason: "no_branch_price" };

    const quantity = await extraBranches(companyId, billing.billed_tier ?? "business");

    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const item = subscription.items.data.find((i) => i.price?.id === price);

    if (!item) {
      // Nothing to add when there is nothing to charge for: creating a zero quantity line on
      // every subscription would put "Extra branch £0.00" on invoices that have no branches.
      if (quantity === 0) return { synced: true, reason: "nothing_to_bill", quantity };
      await stripe.subscriptionItems.create({
        subscription: billing.stripe_subscription_id,
        price,
        quantity,
        proration_behavior: "create_prorations",
      });
    } else if (quantity === 0 && subscription.items.data.length > 1) {
      // Same rule as seats: a line that has fallen to nothing is removed, not zeroed, or every
      // future invoice carries "Extra branch 0 × £7.50 £0.00".
      await stripe.subscriptionItems.del(item.id, {
        proration_behavior: "create_prorations",
      });
    } else if ((item.quantity ?? 0) !== quantity) {
      await stripe.subscriptionItems.update(item.id, {
        quantity,
        proration_behavior: "create_prorations",
      });
    } else {
      return { synced: true, reason: "unchanged", quantity };
    }

    return { synced: true, quantity };
  } catch (e) {
    console.error("[billing] branch sync failed:", (e as Error).message);
    return { synced: false, reason: "error" };
  }
}


/**
 * Nightly billing reconciliation (THE LIST item 16; extended 2026-08-13 to the base price and
 * seats when plan changing was built).
 *
 * Was reconcileBranchBilling. It now checks the PLAN LINE, the SEAT quantity, the BRANCH
 * quantity, and that nobody on a free tier is still being charged. The old name described a
 * third of what it does, and a job that quietly does more than its name says is how the next
 * person misses that it is the only thing standing behind a failed plan change.
 *
 * WHY A RECONCILE AND NOT JUST A HOOK. There is no code path in this product that creates a
 * branch: the only insert is the pair seeded with a new company, and every extra branch Acme
 * has was added straight in SQL. A sync that fired "when a branch is added" would therefore
 * never fire, and would LOOK built while collecting nothing, which is the exact failure this
 * item already was. A founder screen exists now, but the reconcile is what makes the billing
 * true regardless of how the row got there.
 *
 * Cheap: one query for the companies with a live subscription, then one Stripe read per
 * company, and a write only when the quantity actually differs.
 */
export async function reconcileBilling(): Promise<{
  checked: number;
  changed: number;
  skipped: number;
}> {
  const result = { checked: 0, changed: 0, skipped: 0 };
  try {
    /* NOT `if (!branchPriceId()) return` any more. The base price and seat reconciles live in
       this loop too, and they are what heals a tier change whose Stripe half failed — the whole
       reason changeTier writes the tier before telling Stripe. Behind the branch guard, a
       deployment without STRIPE_PRICE_BRANCH would never have run them at all. */
    const hasBranchPrice = Boolean(branchPriceId());
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("company_billing")
      .select("company_id")
      .not("stripe_subscription_id", "is", null);

    for (const row of (data as { company_id: string }[] | null) ?? []) {
      result.checked += 1;

      /* THE BASE PRICE FIRST, and this is the important half.
         Changing a company's tier writes companies.tier and then tells Stripe, in that order,
         because undercharging is the safe direction to fail in. If the Stripe half fails the
         company sits on the new plan paying the old price, and the only witness would be a log
         line nobody reads. Running it here means that heals itself by morning.
         It also has to come BEFORE the branch quantity, since the tier decides the allowance. */
      const base = await syncBasePrice(row.company_id);
      if (base.synced && base.reason === undefined) result.changed += 1;

      /* THE ONE DIRECTION NOTHING ELSE WATCHES. Everything above heals UNDERCHARGING. A company
         on a free tier with a live subscription that is not scheduled to stop is the opposite:
         money being taken that we have promised not to take. It can only arise from a failed
         cancellation or a tier changed by hand in SQL, and in both cases scheduling the
         cancellation is the right answer. Scheduling rather than cancelling keeps it reversible
         for the rest of the period. */
      if (base.reason === "not_subscription_tier") {
        const stopped = await stopBillingAFreeCompany(row.company_id);
        if (stopped) result.changed += 1;
      }

      /* SEATS TOO, and this is not tidiness. The allowance moves with the tier (Business 4,
         Pro 6), so an upgrade whose Stripe half failed leaves the seat quantity computed
         against the OLD allowance. The base price would heal here and the seats would not,
         which turns a temporary undercharge into a permanent OVERCHARGE for users the new plan
         includes — the exact bug this whole change was written to kill, through another door.
         Nothing else in the product calls this on a schedule. */
      const seats = await syncSeatQuantity(row.company_id);
      if (seats.synced && seats.reason === undefined) result.changed += 1;

      if (!hasBranchPrice) {
        result.skipped += 1;
        continue;
      }
      const outcome = await syncBranchQuantity(row.company_id);
      if (outcome.synced && outcome.reason === undefined) result.changed += 1;
      else if (!outcome.synced) result.skipped += 1;
    }
  } catch (e) {
    console.error("[billing] branch reconcile failed:", (e as Error).message);
  }
  return result;
}


/**
 * Cancel the subscription THERE AND THEN, with no refund and no proration.
 *
 * Used by exactly one caller: deleting a company. Moving a company to Black stops billing at
 * the END of the period they already paid for, because they keep what they bought and carry on
 * using it. A deleted company is not carrying on using anything, so leaving the subscription
 * running to the end of the month would bill somebody for a product that no longer exists for
 * them — which is the one billing failure a customer notices on a statement.
 *
 * Deliberately NOT prorated: they had the product for the part of the month they had it. This
 * is the same "no money moves in either direction" rule the move to Black settled on, applied
 * at the other end of the period.
 *
 * Best effort like everything else here, and the caller SAYS SO on screen when it fails: a
 * company that could not be unsubscribed is still charged, and the founder needs to know that
 * in the same breath as being told the company has gone, not from a log line.
 */
export async function cancelSubscriptionNow(
  companyId: string,
): Promise<{ cancelled: boolean; reason?: string }> {
  try {
    const stripe = getStripe();
    if (!stripe) return { cancelled: false, reason: "stripe_unconfigured" };

    const billing = await getCompanyBilling(companyId);
    if (!billing?.stripe_subscription_id) return { cancelled: true, reason: "no_subscription" };
    if (subscriptionHasEnded(billing.subscription_status)) {
      return { cancelled: true, reason: "already_ended" };
    }

    await stripe.subscriptions.cancel(billing.stripe_subscription_id, { prorate: false });
    // Write it back rather than waiting for the webhook: the founder is looking at the screen
    // now, and "cancelled" that depends on a round trip is a claim, not a result.
    await upsertCompanyBilling(companyId, {
      subscription_status: "canceled",
      cancel_at_period_end: false,
    });
    return { cancelled: true };
  } catch (e) {
    console.error("[billing] immediate cancel failed:", (e as Error).message);
    return { cancelled: false, reason: "error" };
  }
}
