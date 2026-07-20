import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { seatPriceId, isSubscriptionTier } from "@/lib/stripe/config";
import { includedSeatsForTier } from "@/lib/billing/seats";

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
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active")
    .neq("role", "platform_admin");
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
 */
export async function ensureCustomer(
  companyId: string,
  opts?: { name?: string; email?: string },
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const existing = await getCompanyBilling(companyId);
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe.customers.create({
    name: opts?.name,
    email: opts?.email,
    metadata: { company_id: companyId },
  });
  await upsertCompanyBilling(companyId, { stripe_customer_id: customer.id });
  return customer.id;
}

/**
 * Push the current extra-seat count onto the company's live subscription.
 * No-op (returns a reason) when: Stripe unset, no subscription, tier is not a
 * subscription tier (Diamond/Black), or the quantity already matches. Never
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
