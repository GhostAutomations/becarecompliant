"use server";

/**
 * Billing server actions: start Checkout (subscribe / add a card) and open the
 * Stripe Customer Portal (manage card, invoices, cancel). We never render a card
 * form ourselves: Stripe hosts both, so card data never touches our servers.
 *
 * Both return ActionState with redirectTo set to a Stripe-hosted URL; the client
 * button navigates there with window.location (external, not the Next router).
 * Company Admin only. Diamond (usage only) and Black (free) have no Checkout.
 */

import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";
import type { ActionState } from "@/lib/forms";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import {
  isSubscriptionTier,
  tierBasePriceId,
  seatPriceId,
  tierPricingReady,
  aiTopupPriceId,
  AI_TOPUP_CREDITS,
  TIER_LABELS,
  type SubscriptionTier,
} from "@/lib/stripe/config";
import {
  ensureCustomer,
  getCompanyBilling,
  getActiveSeatCount,
  extraSeats,
} from "@/lib/billing/stripe-sync";

export async function startCheckout(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company on your account." };

  if (!stripeConfigured()) {
    return { error: "Billing is not configured yet. Please try again later." };
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, tier")
    .eq("id", profile.company_id)
    .maybeSingle();
  const tier = company?.tier ?? "";

  if (tier === "black") {
    return { error: "Your account is on the Black plan: everything is included, with nothing to pay." };
  }
  if (tier === "diamond") {
    return { error: "Your account is on the Diamond plan: you are billed for usage only, so there is no subscription to set up." };
  }
  if (!isSubscriptionTier(tier)) {
    return { error: "Your plan does not use a subscription." };
  }
  if (!tierPricingReady(tier as SubscriptionTier)) {
    return { error: "Billing for your plan is not fully configured yet. Please contact support." };
  }

  const billing = await getCompanyBilling(profile.company_id);
  if (
    billing?.stripe_subscription_id &&
    ["active", "trialing", "past_due"].includes(billing.subscription_status ?? "")
  ) {
    return { error: "You already have an active subscription. Use Manage billing to change your card or plan." };
  }

  const stripe = getStripe()!;
  const customerId = await ensureCustomer(profile.company_id, {
    name: company?.name ?? undefined,
    email: profile.email,
  });
  if (!customerId) {
    return { error: "Could not create your billing account. Please try again." };
  }

  const active = await getActiveSeatCount(profile.company_id);
  const extra = extraSeats(active);

  const lineItems: { price: string; quantity: number }[] = [
    { price: tierBasePriceId(tier as SubscriptionTier)!, quantity: 1 },
  ];
  // Only add the per-seat line when there are extra seats; syncSeatQuantity adds
  // it later if a 5th user joins after subscribing. Checkout rejects quantity 0.
  if (extra > 0) lineItems.push({ price: seatPriceId()!, quantity: extra });

  const base = siteUrl();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: lineItems,
      client_reference_id: profile.company_id,
      subscription_data: { metadata: { company_id: profile.company_id } },
      success_url: `${base}/settings/billing?checkout=success`,
      cancel_url: `${base}/settings/billing?checkout=cancelled`,
      billing_address_collection: "auto",
    });
    if (!session.url) return { error: "Could not start checkout. Please try again." };

    await writeAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "billing.checkout_started",
      entityType: "company",
      entityId: profile.company_id,
      summary: `Started checkout for the ${TIER_LABELS[tier as SubscriptionTier]} plan`,
      metadata: { tier, extra_seats: extra },
    });

    return { redirectTo: session.url };
  } catch (e) {
    console.error("[billing] checkout create failed:", (e as Error).message);
    return { error: "Could not start checkout. Please try again." };
  }
}

/** Start a one-time Checkout to buy AI credit top-ups (bundles of AI_TOPUP_CREDITS).
 *  The webhook grants the credits on payment; we never grant here. Admin only. */
export async function startAiTopupCheckout(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company on your account." };
  if (!stripeConfigured()) {
    return { error: "Billing is not configured yet. Please try again later." };
  }
  const priceId = aiTopupPriceId();
  if (!priceId) {
    return { error: "AI credit top-ups are not set up yet. Please contact support." };
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id)
    .maybeSingle();

  const stripe = getStripe()!;
  const customerId = await ensureCustomer(profile.company_id, {
    name: company?.name ?? undefined,
    email: profile.email,
  });
  if (!customerId) return { error: "Could not create your billing account. Please try again." };

  const base = siteUrl();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 },
        },
      ],
      client_reference_id: profile.company_id,
      metadata: { company_id: profile.company_id, kind: "ai_topup", credits_per_unit: String(AI_TOPUP_CREDITS) },
      success_url: `${base}/settings/billing?topup=success`,
      cancel_url: `${base}/settings/billing?topup=cancelled`,
      billing_address_collection: "auto",
    });
    if (!session.url) return { error: "Could not start checkout. Please try again." };

    await writeAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "billing.ai_topup_started",
      entityType: "company",
      entityId: profile.company_id,
      summary: "Started an AI credit top-up checkout",
    });
    return { redirectTo: session.url };
  } catch (e) {
    console.error("[billing] topup checkout failed:", (e as Error).message);
    return { error: "Could not start checkout. Please try again." };
  }
}

export async function openBillingPortal(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company on your account." };

  if (!stripeConfigured()) {
    return { error: "Billing is not configured yet. Please try again later." };
  }

  const billing = await getCompanyBilling(profile.company_id);
  if (!billing?.stripe_customer_id) {
    return { error: "There is no billing account to manage yet. Subscribe first." };
  }

  const stripe = getStripe()!;
  const base = siteUrl();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${base}/settings/billing`,
    });
    return { redirectTo: session.url };
  } catch (e) {
    console.error("[billing] portal create failed:", (e as Error).message);
    return { error: "Could not open the billing portal. Please try again." };
  }
}
