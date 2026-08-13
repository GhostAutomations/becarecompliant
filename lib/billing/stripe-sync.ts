import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { seatPriceId, branchPriceId, isSubscriptionTier } from "@/lib/stripe/config";
import { includedSeatsForTier, includedBranchesForTier, NON_BILLABLE_ROLES } from "@/lib/billing/seats";
import { customerIdentityPatch } from "@/lib/billing/customer-identity";
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
async function refreshCustomerIdentity(
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
      // Subscription has no seat line yet: add it at the right quantity.
      await stripe.subscriptionItems.create({
        subscription: billing.stripe_subscription_id,
        price: seatPrice,
        quantity,
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
 * Nightly branch billing reconciliation (THE LIST item 16).
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
export async function reconcileBranchBilling(): Promise<{
  checked: number;
  changed: number;
  skipped: number;
}> {
  const result = { checked: 0, changed: 0, skipped: 0 };
  try {
    if (!branchPriceId()) return result;
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("company_billing")
      .select("company_id")
      .not("stripe_subscription_id", "is", null);

    for (const row of (data as { company_id: string }[] | null) ?? []) {
      result.checked += 1;
      const outcome = await syncBranchQuantity(row.company_id);
      if (outcome.synced && outcome.reason === undefined) result.changed += 1;
      else if (!outcome.synced) result.skipped += 1;
    }
  } catch (e) {
    console.error("[billing] branch reconcile failed:", (e as Error).message);
  }
  return result;
}
