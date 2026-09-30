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
  getOrderedExtras,
  extraBranches,
  upsertCompanyBilling,
} from "@/lib/billing/stripe-sync";
import { billedExtra } from "@/lib/billing/ordered-extras";
import { checkoutLines, intervalsFromOrder, onboardingDue, type Interval } from "@/lib/billing/annual";
import { listAcceptances } from "@/lib/legal/acceptance";
import { acceptanceCurrent } from "@/lib/legal/fill";
import { LEGAL_VERSIONS, legalPublished } from "@/lib/legal/documents";
import { ONBOARDING_FEE_PENCE, onboardingOfferActive } from "@/lib/marketing/offer";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
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

  const prepared = await prepareSubscription(profile.company_id);
  if ("error" in prepared) return { error: prepared.error };
  const { tier, companyName, plan, extras, extra, extraBranch, onboardingPence } = prepared;

  // Nobody is charged an amount that disagrees with what we showed them. See
  // lib/billing/price-check.ts: this refuses the sale rather than trusting the dashboard.
  const priceProblem = await checkoutPriceProblem(tier, {
    includeSeat: extra > 0,
    includeBranch: extraBranch > 0,
    interval: plan,
    extrasInterval: extras,
  });
  if (priceProblem) return { error: priceProblem };

  const stripe = getStripe()!;
  const customerId = await ensureCustomer(profile.company_id, {
    name: companyName ?? undefined,
    email: profile.email,
  });
  if (!customerId) {
    return { error: "Could not create your billing account. Please try again." };
  }

  /* The recurring lines. On Annual with monthly extras, Checkout cannot mix yearly and monthly
     lines, so it carries the plan only and the webhook adds the monthly extras to the same
     subscription straight after (lib/billing/annual.ts). */
  const { lines } = checkoutLines({
    basePriceId: tierBasePriceId(tier, plan)!,
    seatPriceId: seatPriceId(extras),
    branchPriceId: branchPriceId(extras),
    extraSeats: extra,
    extraBranches: extraBranch,
    plan,
    extras,
  });
  const lineItems: Array<
    | { price: string; quantity: number }
    | { price_data: { currency: string; unit_amount: number; product_data: { name: string } }; quantity: number }
  > = [...lines];
  // The onboarding fee, one-off, on the first invoice only, when it is due (clause 3.6 and 7.6).
  if (onboardingPence > 0) {
    lineItems.push({
      price_data: { currency: "gbp", unit_amount: onboardingPence, product_data: { name: "Onboarding" } },
      quantity: 1,
    });
  }

  const base = siteUrl();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Card only (Phil, 2026-09-30: card by default). Bank transfer is the separate "Get an
      // invoice instead" route. Named explicitly because the account now has Bank Transfers
      // switched on, and Checkout would otherwise offer whatever the account allows.
      payment_method_types: ["card"],
      line_items: lineItems,
      client_reference_id: profile.company_id,
      subscription_data: {
        metadata: { company_id: profile.company_id, billing_interval: plan, extras_interval: extras },
        // Flexible billing mode lets the monthly extras sit on a yearly plan's subscription.
        billing_mode: { type: "flexible" },
      },
      metadata: { company_id: profile.company_id, billing_interval: plan, extras_interval: extras },
      success_url: `${base}/settings/billing?checkout=success`,
      cancel_url: `${base}/settings/billing?checkout=cancelled`,
      billing_address_collection: "auto",
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);
    if (!session.url) return { error: "Could not start checkout. Please try again." };

    await writeAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "billing.checkout_started",
      entityType: "company",
      entityId: profile.company_id,
      summary: `Started checkout for the ${TIER_LABELS[tier]} plan, ${plan === "year" ? "yearly" : "monthly"}`,
      metadata: { tier, extra_seats: extra, extra_branches: extraBranch, billing_interval: plan, extras_interval: extras },
    });

    return { redirectTo: session.url };
  } catch (e) {
    console.error("[billing] checkout create failed:", (e as Error).message);
    return { error: "Could not start checkout. Please try again." };
  }
}

/**
 * "PREFER TO PAY BY BANK TRANSFER? GET AN INVOICE INSTEAD" (Phil, 2026-09-30, Annual only).
 *
 * The same subscription as Checkout would create, but made directly and billed by invoice:
 * Stripe emails it, and it can be paid within 14 days by card or by UK bank transfer to the
 * account number Stripe gives this customer (Stripe matches the payment itself). The invoice
 * link comes back so the Admin can open it straight away rather than wait for the email.
 *
 * SAFE TO PRESS TWICE. The Stripe idempotency key is the company and the Order it accepted, so
 * a double press, or a retry after a timeout, returns the same subscription rather than two.
 */
export async function startInvoiceSubscription(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin({ allowLapsed: true });
  if (!profile.company_id) return { error: "No company on your account." };
  if (!stripeConfigured()) return { error: "Billing is not configured yet. Please try again later." };

  const prepared = await prepareSubscription(profile.company_id);
  if ("error" in prepared) return { error: prepared.error };
  const { tier, companyName, plan, extras, extra, extraBranch, onboardingPence, acceptanceId } = prepared;
  if (plan !== "year") return { error: "Invoices are for the Annual option. Monthly is paid by card." };

  const priceProblem = await checkoutPriceProblem(tier, {
    includeSeat: extra > 0,
    includeBranch: extraBranch > 0,
    interval: plan,
    extrasInterval: extras,
  });
  if (priceProblem) return { error: priceProblem };

  const stripe = getStripe()!;
  const customerId = await ensureCustomer(profile.company_id, { name: companyName ?? undefined, email: profile.email });
  if (!customerId) return { error: "Could not create your billing account. Please try again." };

  // Every line on one subscription: flexible billing mode allows monthly extras on a yearly plan.
  const items: Array<{ price: string; quantity: number }> = [{ price: tierBasePriceId(tier, plan)!, quantity: 1 }];
  if (extra > 0 && seatPriceId(extras)) items.push({ price: seatPriceId(extras)!, quantity: extra });
  if (extraBranch > 0 && branchPriceId(extras)) items.push({ price: branchPriceId(extras)!, quantity: extraBranch });

  const key = `bcc-invoice-sub-${profile.company_id}-${acceptanceId ?? "none"}`;
  try {
    // The onboarding fee as a pending line, which Stripe puts on the subscription's first invoice.
    if (onboardingPence > 0) {
      await stripe.invoiceItems.create(
        { customer: customerId, amount: onboardingPence, currency: "gbp", description: "Onboarding" },
        { idempotencyKey: `${key}-onboarding` },
      );
    }
    const sub = await stripe.subscriptions.create(
      {
        customer: customerId,
        items,
        collection_method: "send_invoice",
        days_until_due: 14,
        payment_settings: {
          payment_method_types: ["card", "customer_balance"],
          payment_method_options: {
            customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "gb_bank_transfer" } },
          },
        },
        billing_mode: { type: "flexible" },
        metadata: { company_id: profile.company_id, billing_interval: plan, extras_interval: extras, paid_by: "invoice" },
        expand: ["latest_invoice"],
      } as Parameters<typeof stripe.subscriptions.create>[0],
      { idempotencyKey: key },
    );

    await upsertCompanyBilling(profile.company_id, {
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      billed_tier: tier,
      billing_interval: plan,
      extras_interval: extras,
    });

    const invoice = sub.latest_invoice && typeof sub.latest_invoice !== "string" ? sub.latest_invoice : null;
    await writeAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "billing.invoice_subscription_started",
      entityType: "company",
      entityId: profile.company_id,
      summary: `Chose to pay the ${TIER_LABELS[tier]} plan yearly by invoice`,
      metadata: { subscription: sub.id, invoice: invoice?.id ?? null },
    });
    revalidatePath("/settings/billing");
    return {
      ok: "Sent",
      data: {
        invoiceUrl: invoice?.hosted_invoice_url ?? "",
        email: profile.email,
      },
    };
  } catch (e) {
    console.error("[billing] invoice subscription failed:", (e as Error).message);
    return { error: "Could not set up your invoice. Nothing has been charged. Please try again, or email hello@becarecompliant.com." };
  }
}

/**
 * Everything both ways of paying need, decided once: the plan, whether it is monthly or yearly
 * (from the Order the Company Admin accepted), the extras counted from the users and branches
 * actually set up, and whether the onboarding fee is due. Refuses in plain words when it cannot.
 */
async function prepareSubscription(companyId: string): Promise<
  | { error: string }
  | {
      tier: SubscriptionTier;
      companyName: string | null;
      plan: Interval;
      extras: Interval;
      extra: number;
      extraBranch: number;
      onboardingPence: number;
      acceptanceId: string | null;
    }
> {
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name, tier").eq("id", companyId).maybeSingle();
  const tier = (company?.tier as string | undefined) ?? "";

  if (tier === "black") {
    return { error: "Your account is on the Black plan: everything is included, with nothing to pay." };
  }
  if (!isSubscriptionTier(tier)) return { error: "Your plan does not use a subscription." };

  const billing = await getCompanyBilling(companyId);
  if (billing?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(billing.subscription_status ?? "")) {
    return { error: "You already have an active subscription. Use Manage billing to change your card or plan." };
  }

  // Monthly or Annual, from the Order in force (lib/billing/annual.ts). No Order yet: monthly.
  const acceptances = await listAcceptances(companyId);
  const current = acceptances.find((a) => acceptanceCurrent([a], LEGAL_VERSIONS, legalPublished())) ?? null;
  const { plan, extras } = intervalsFromOrder(current);

  if (!tierPricingReady(tier, plan, extras)) {
    return {
      error:
        plan === "year"
          ? "Paying yearly by card is not switched on yet. Please choose Get an invoice instead, or email hello@becarecompliant.com."
          : "Billing for your plan is not fully configured yet. Please contact support.",
    };
  }

  // Seats and branches are counted BEFORE the price check, because the check only looks at a
  // price when its line is actually going on this invoice.
  // What they ordered is the least they pay for (Phil, 2026-09-30, after test I3): the total
  // they accepted includes the extras they asked for, so Stripe must charge them from day one.
  const ordered = await getOrderedExtras(companyId);
  const extra = billedExtra(extraSeats(await getActiveSeatCount(companyId), tier), ordered.users);
  const extraBranch = branchPriceId(extras) ? billedExtra(await extraBranches(companyId, tier), ordered.branches) : 0;

  const due = onboardingDue({
    tier,
    offerActiveOnStartDate: onboardingOfferActive(current?.start_date ?? formatCivilDate(todayInLondon())),
    hadSubscriptionBefore: Boolean(billing?.stripe_subscription_id),
  });

  return {
    tier,
    companyName: (company?.name as string | null) ?? null,
    plan,
    extras,
    extra,
    extraBranch,
    onboardingPence: due ? ONBOARDING_FEE_PENCE : 0,
    acceptanceId: current?.id ?? null,
  };
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
      // Card only: credits are added when Checkout completes as paid. A bank transfer settles
      // days later, and nothing listens for that, so it would take the money and add no credits.
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 },
        },
      ],
      client_reference_id: profile.company_id,
      metadata: { company_id: profile.company_id, kind: "ai_topup", credits_per_unit: String(AI_TOPUP_CREDITS) },
      // A proper invoice for every top up, emailed with the receipt (Phil, 2026-09-30).
      invoice_creation: { enabled: true },
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
      // Card only: credits are added when Checkout completes as paid. A bank transfer settles
      // days later, and nothing listens for that, so it would take the money and add no credits.
      payment_method_types: ["card"],
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
      // A proper invoice for every top up, emailed with the receipt (Phil, 2026-09-30).
      invoice_creation: { enabled: true },
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
