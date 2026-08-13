"use server";

/**
 * Billing server actions: start Checkout (subscribe / add a card) and open the
 * Stripe Customer Portal (manage card, invoices, cancel). We never render a card
 * form ourselves: Stripe hosts both, so card data never touches our servers.
 *
 * Both return ActionState with redirectTo set to a Stripe-hosted URL; the client
 * button navigates there with window.location (external, not the Next router).
 * Company Admin only. Black (free, founder granted) has no Checkout.
 */

import { revalidatePath } from "next/cache";
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
  branchPriceId,
  tierPricingReady,
  aiTopupPriceId,
  AI_TOPUP_CREDITS,
  SMS_TOPUP_CREDITS,
  smsTopupPriceId,
  TIER_LABELS,
  type SubscriptionTier,
} from "@/lib/stripe/config";
import {
  ensureCustomer,
  getCompanyBilling,
  getActiveSeatCount,
  extraSeats,
  extraBranches,
} from "@/lib/billing/stripe-sync";
import { checkoutPriceProblem } from "@/lib/billing/price-check";
import { changeTier } from "@/lib/billing/tier-apply";

/**
 * Upgrade this company from Business to Pro.
 *
 * THE LAUNCH BLOCKER, found 2026-08-13: companies.tier was written at creation and by trial
 * provisioning and by NOTHING ELSE, so no Business customer could ever move up to Pro. The app
 * is upstream of Stripe here (the webhook copies billed_tier FROM companies.tier and never
 * derives the tier from the price), so a plan change made in the Stripe portal would not have
 * moved it either.
 *
 * Not a new Checkout: they already have a card and a subscription, so this swaps the base price
 * on the subscription they have, prorated onto the next invoice, exactly as adding a seat or a
 * branch does. A second Checkout would take a second payment method and leave two subscriptions.
 *
 * allowLapsed, for the same reason startCheckout has it: upgrading is a way OUT of a lapsed
 * trial, and gating it behind the lock it clears would leave somebody with no route back.
 */
export async function upgradeToPro(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin({ allowLapsed: true });
  if (!profile.company_id) return { error: "No company on your account." };
  if (!stripeConfigured()) {
    return { error: "Billing is not configured yet. Please try again later." };
  }

  // The price guard (refuse rather than charge an amount nobody was shown) lives inside
  // changeTier, so the founder control gets it too. It used to be here and only here.
  const outcome = await changeTier({
    companyId: profile.company_id,
    to: "pro",
    actor: "company_admin",
  });
  if (!outcome.ok) return { error: outcome.error };

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "billing.tier_changed",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Upgraded from the ${outcome.from} plan to the ${outcome.to} plan`,
    metadata: { from: outcome.from, to: outcome.to, billing_settled: outcome.billingSettled },
  });

  revalidatePath("/settings/billing");
  revalidatePath("/dashboard");
  if (!outcome.billingSettled) {
    // A green "Saved" flash over "we could not update your subscription" is a lie told in the
    // most reassuring possible font. The plan DID change, which the message says; the button
    // still has to read as something went wrong.
    return {
      error:
        "You are on Pro, but we could not update your subscription just now, so you have not been charged the difference yet. We will put that right automatically.",
    };
  }
  /* outcome.message, not a hard-coded sentence. The card is shown to any Business company,
     including one that has never subscribed and one whose subscription has been cancelled, and
     both of those were being told in green that a difference had been prorated onto an invoice
     that does not exist. The rule already knows which case it is; use its words. */
  return { ok: outcome.message };
}

export async function startCheckout(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  // allowLapsed: this is the way OUT of a lapsed trial. Gating it behind the same lock it
  // exists to clear would leave a customer with no route back to their own records.
  const { profile } = await requireCompanyAdmin({ allowLapsed: true });
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

  // Seats are counted BEFORE the price check, because the check only looks at the seat
  // price when a seat line is actually going on this invoice.
  const active = await getActiveSeatCount(profile.company_id);
  const extra = extraSeats(active, tier);

  // Nobody is charged an amount that disagrees with what we showed them. See
  // lib/billing/price-check.ts: this refuses the sale rather than trusting the dashboard.
  // Same for branches (THE LIST item 16): a company can be inside its user allowance and over
  // its branch allowance. extraBranches is 0 when no branch price is configured, so a
  // deployment without STRIPE_PRICE_BRANCH simply sells what it sold before rather than
  // failing: the founder health panel is what says the price is missing.
  const extraBranch = branchPriceId() ? await extraBranches(profile.company_id, tier) : 0;

  const priceProblem = await checkoutPriceProblem(tier, {
    includeSeat: extra > 0,
    includeBranch: extraBranch > 0,
  });
  if (priceProblem) return { error: priceProblem };

  const stripe = getStripe()!;
  const customerId = await ensureCustomer(profile.company_id, {
    name: company?.name ?? undefined,
    email: profile.email,
  });
  if (!customerId) {
    return { error: "Could not create your billing account. Please try again." };
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: tierBasePriceId(tier as SubscriptionTier)!, quantity: 1 },
  ];
  // Only add the per-seat line when there are extra seats; syncSeatQuantity adds
  // it later if a 5th user joins after subscribing. Checkout rejects quantity 0.
  if (extra > 0) lineItems.push({ price: seatPriceId()!, quantity: extra });
  // Same rule for branches: only when there is one to charge for, and syncBranchQuantity adds
  // the line later if a branch is provisioned after they subscribe.
  if (extraBranch > 0) lineItems.push({ price: branchPriceId()!, quantity: extraBranch });

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

/** Start a one-time Checkout to buy SMS top-ups (bundles of SMS_TOPUP_CREDITS).
 *  The webhook grants the texts on payment; we never grant here. Admin only. */
export async function startSmsTopupCheckout(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company on your account." };
  if (!stripeConfigured()) {
    return { error: "Billing is not configured yet. Please try again later." };
  }
  const priceId = smsTopupPriceId();
  if (!priceId) {
    return { error: "SMS top ups are not set up yet. Please contact support." };
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
      metadata: {
        company_id: profile.company_id,
        kind: "sms_topup",
        credits_per_unit: String(SMS_TOPUP_CREDITS),
      },
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
      action: "billing.sms_topup_started",
      entityType: "company",
      entityId: profile.company_id,
      summary: "Started an SMS top up checkout",
    });
    return { redirectTo: session.url };
  } catch (e) {
    console.error("[billing] sms topup checkout failed:", (e as Error).message);
    return { error: "Could not start checkout. Please try again." };
  }
}

export async function openBillingPortal(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  // allowLapsed for the same reason as startCheckout: a lapsed company must still be able
  // to reach its card, its invoices and its own cancellation.
  const { profile } = await requireCompanyAdmin({ allowLapsed: true });
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
