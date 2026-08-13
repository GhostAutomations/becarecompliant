import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getSeatUsage,
  getBranchUsage,
  formatPence,
  EXTRA_BRANCH_PENCE,
  EXTRA_SEAT_PENCE,
  includedSeatsForTier,
  includedBranchesForTier,
} from "@/lib/billing/seats";
import ActionForm from "@/components/action-form";
import { upgradeToPro } from "@/lib/billing/actions";
import { subscriptionMonthlyPence } from "@/lib/billing/monthly-total";
import { getAiCreditBalance } from "@/lib/billing/ai-credits";
import { getSmsCreditBalance } from "@/lib/billing/sms-credits";
import { SMS_TOPUP_CREDITS, SMS_TOPUP_PENCE, smsTopupPriceId } from "@/lib/stripe/config";
import { TIER_LABELS, TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import { stripeConfigured } from "@/lib/stripe/client";
import {
  SubscribeButton,
  ManageBillingButton,
  TopUpCreditsButton,
  TopUpSmsButton,
} from "@/components/billing/billing-actions";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Billing" };

const TIER_BLURB: Record<string, string> = {
  business:
    "Core compliance: People and Service User registers, checks, forms, RAG status and email reminders.",
  pro: "Everything in Business, plus SMS reminders, reporting and inspector ready exports, and the form builder.",
  black: "Everything included, with nothing to pay.",
};

function statusPill(status: string | null): { cls: string; text: string } {
  switch (status) {
    case "active":
    case "trialing":
      return { cls: "pill-green", text: "Active" };
    case "past_due":
    case "unpaid":
      return { cls: "pill-red", text: "Payment due" };
    case "canceled":
      return { cls: "pill-neutral", text: "Cancelled" };
    case "incomplete":
    case "incomplete_expired":
      return { cls: "pill-amber", text: "Not finished" };
    default:
      return { cls: "pill-neutral", text: "Not set up" };
  }
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BillingPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const [{ data: company }, seats, { data: billing }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, tier, status")
      .eq("id", profile.company_id)
      .maybeSingle(),
    getSeatUsage(profile.company_id),
    supabase
      .from("company_billing")
      .select(
        "stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, seat_quantity",
      )
      .eq("company_id", profile.company_id)
      .maybeSingle(),
  ]);

  const tier = company?.tier ?? "business";
  const branches = await getBranchUsage(profile.company_id, tier);
  const aiCredits = await getAiCreditBalance(profile.company_id);
  const smsCredits = await getSmsCreditBalance(profile.company_id);
  const AI_ALLOWANCE: Record<string, number> = { business: 25, pro: 50, black: 1000 };
  const aiMonthly = AI_ALLOWANCE[tier] ?? 25;
  // Mirrors tier_monthly_sms_credits in migration 0159. Business gets none: SMS escalation is a
  // Pro feature, and the zero allowance is the same rule expressed in the ledger.
  const SMS_ALLOWANCE: Record<string, number> = { business: 0, pro: 100, black: 2000 };
  const smsMonthly = SMS_ALLOWANCE[tier] ?? 0;
  const smsTopupReady = Boolean(smsTopupPriceId());
  const isSub = isSubscriptionTier(tier);
  const basePence = isSub ? TIER_BASE_PENCE[tier as keyof typeof TIER_BASE_PENCE] : 0;
  // Extra BRANCHES are part of the bill now (THE LIST item 16), so they belong in the total.
  // Until this line, the page listed "1 extra branch at £7.50, £7.50/mo" and then totalled
  // £69.00 — which was survivable only while nothing actually charged for a branch. The moment
  // it does, that page is telling a customer £69 and Stripe is taking £76.50. This product has
  // already been bitten once by a screen and an invoice disagreeing (£69 sold, £99 charged).
  const monthlyTotalPence = subscriptionMonthlyPence({
    basePence,
    extraSeats: seats.extra,
    seatPence: EXTRA_SEAT_PENCE,
    extraBranches: branches.extra,
    branchPence: EXTRA_BRANCH_PENCE,
  });

  /* WHAT PRO WOULD ACTUALLY COST THEM, worked out from their own numbers rather than quoted as
     a headline price. Pro includes 6 users and 2 branches against Business's 4 and 1, so an
     upgrade can REDUCE the extras bill at the same time as it raises the base, and the only
     honest thing to show somebody is the new total. */
  const canUpgradeToPro = tier === "business";
  const proSeatExtra = Math.max(0, seats.used - includedSeatsForTier("pro"));
  const proBranchExtra = Math.max(0, branches.used - includedBranchesForTier("pro"));
  const proTotalPence = subscriptionMonthlyPence({
    basePence: TIER_BASE_PENCE.pro,
    extraSeats: proSeatExtra,
    seatPence: EXTRA_SEAT_PENCE,
    extraBranches: proBranchExtra,
    branchPence: EXTRA_BRANCH_PENCE,
  });
  const hasSubscription = Boolean(billing?.stripe_subscription_id);
  const activeSub = ["active", "trialing", "past_due"].includes(
    billing?.subscription_status ?? "",
  );
  /* A cancelled subscription is a subscription id with nothing behind it. Using hasSubscription
     to decide whether to promise "prorated onto your next invoice" told a company whose
     subscription had ended that it would be charged a difference on an invoice that is never
     going to be issued. */
  const willBeProrated = hasSubscription && activeSub;
  const pill = statusPill(billing?.subscription_status ?? null);
  const periodEnd = billing?.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Billing</h1>
        <p className="page-subtitle">
          Your plan, seats, payment method and invoices.
        </p>
      </div>

      {!stripeConfigured() && (
        <div className="glass-card border border-amber-400/30 p-4">
          <p className="text-sm text-amber-200">
            Billing is being set up. Your plan and seat costs are shown below;
            card and invoice management will be available shortly.
          </p>
        </div>
      )}

      {/* Current plan */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white/80">Current plan</h2>
            <p className="mt-2 text-2xl font-bold text-white">
              {TIER_LABELS[tier as keyof typeof TIER_LABELS] ?? tier}
            </p>
          </div>
          {isSub && (
            <span className={`pill ${pill.cls}`} aria-label={`Subscription status: ${pill.text}`}>
              {pill.text}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-white/60">{TIER_BLURB[tier] ?? ""}</p>
      </section>

      {/* AI credits */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">AI credits</h2>
        <p className="mt-2 text-3xl font-bold text-white">
          {aiCredits} <span className="text-base font-medium text-white/55">credits left</span>
        </p>
        <p className="mt-2 text-sm text-white/60">
          One credit is used each time you use an AI feature, such as generating a complaint response. Your plan
          includes {aiMonthly} credits a month and any unused credits carry over. Top ups are 100 credits for £10 plus VAT.
        </p>
        <div className="mt-4">
          <TopUpCreditsButton />
        </div>
      </section>

      {/* SMS allowance */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">SMS</h2>
        <p className="mt-2 text-3xl font-bold text-white">
          {smsCredits} <span className="text-base font-medium text-white/55">texts left</span>
        </p>
        {/* A Business company cannot SEND an SMS at all: escalation is a Pro feature and the
            digest refuses it on tier before it ever reaches the sender. Offering them a top up
            would be taking money for texts they can never use. */}
        {smsMonthly > 0 ? (
          <p className="mt-2 text-sm text-white/60">
            One text is used each time we escalate an overdue check by SMS. Your plan includes{" "}
            {smsMonthly} texts a month and any unused ones carry over. Top ups are{" "}
            {SMS_TOPUP_CREDITS} texts for £{(SMS_TOPUP_PENCE / 100).toFixed(0)} plus VAT.{" "}
            <span className="text-white/80">
              When the balance reaches zero we stop sending texts, so you can never run up a bill
              you have not bought.
            </span>{" "}
            Email escalation carries on either way.
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/60">
            SMS escalation is available on the Pro plan and above, so this plan has no SMS
            allowance and no texts are sent. Everything else escalates by email as normal.
          </p>
        )}
        {/* No button when there is no Stripe price behind it either: a button that always errors
            is worse than no button. */}
        {smsMonthly > 0 && smsTopupReady ? (
          <div className="mt-4">
            <TopUpSmsButton />
          </div>
        ) : null}
      </section>

      {/* Seats and cost */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Seats</h2>
        <p className="mt-2 text-3xl font-bold text-white">
          {seats.used}
          <span className="text-base font-medium text-white/50">
            {" "}
            of {seats.included} included
          </span>
        </p>
        {isSub ? (
          <div className="mt-3 space-y-1 text-sm text-white/70">
            <div className="flex justify-between">
              <span>{TIER_LABELS[tier as keyof typeof TIER_LABELS]} base</span>
              <span>{formatPence(basePence)}/mo</span>
            </div>
            <div className="flex justify-between">
              <span>
                {seats.extra} extra {seats.extra === 1 ? "seat" : "seats"} at{" "}
                {formatPence(500)}
              </span>
              <span>{formatPence(seats.extraCostPence)}/mo</span>
            </div>
            {/* Above the total, because a total has to come after the things it adds up. */}
            {branches.extra > 0 ? (
              <div className="flex justify-between">
                <span>
                  {branches.extra} extra {branches.extra === 1 ? "branch" : "branches"} at{" "}
                  {formatPence(EXTRA_BRANCH_PENCE)}
                </span>
                <span>{formatPence(branches.extraCostPence)}/mo</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
              <span>Estimated monthly total</span>
              <span>{formatPence(monthlyTotalPence)}/mo</span>
            </div>
            <p className="pt-1 text-xs text-white/40">
              Each user beyond the first {seats.included} is {formatPence(500)} per
              month, and each branch beyond {branches.included} is{" "}
              {formatPence(EXTRA_BRANCH_PENCE)} per month. Changes are prorated onto your next
              invoice.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/60">
            All users are included at no charge on the Black plan.
          </p>
        )}
      </section>

      {/* UPGRADE TO PRO. Until 2026-08-13 there was no way for a customer to change plan at
          all: companies.tier was written at creation and by trial provisioning and by nothing
          else. This is not a second Checkout — they already have a card and a subscription, so
          it swaps the base price on the one they have, prorated, exactly as adding a seat does.
          A second Checkout would take a second payment method and leave two subscriptions. */}
      {canUpgradeToPro ? (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Move to Pro</h2>
          <p className="mt-2 text-sm text-white/70">
            Pro adds SMS reminders, reporting and inspector ready exports, the form builder,
            Complaints, Invoicing, the Planner and On Call. It also includes{" "}
            {includedSeatsForTier("pro")} users and {includedBranchesForTier("pro")} branches
            instead of {seats.included} and {branches.included}.
          </p>
          <div className="mt-3 space-y-1 text-sm text-white/70">
            <div className="flex justify-between">
              <span>You pay now</span>
              <span>{formatPence(monthlyTotalPence)}/mo</span>
            </div>
            <div className="flex justify-between font-semibold text-white">
              <span>On Pro</span>
              <span>{formatPence(proTotalPence)}/mo</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-white/40">
            {willBeProrated
              ? "The difference is prorated onto your next invoice, so you only pay for the rest of this month."
              : "Nothing is charged until you subscribe."}
          </p>
          <div className="mt-4">
            <ActionForm
              action={upgradeToPro}
              label="Move to Pro"
              savedLabel="On Pro"
              confirm={`Move to Pro? Your monthly total goes from ${formatPence(monthlyTotalPence)} to ${formatPence(proTotalPence)}${willBeProrated ? ", prorated onto your next invoice" : ". Nothing is charged until you subscribe"}.`}
            />
          </div>
        </section>
      ) : null}

      {/* Branches */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Branches</h2>
        <p className="mt-2 text-3xl font-bold text-white">
          {branches.used}
          <span className="text-base font-medium text-white/50"> of {branches.included} included</span>
        </p>
        {branches.extra > 0 ? (
          <p className="mt-3 text-sm text-white/70">
            {branches.extra} extra {branches.extra === 1 ? "branch" : "branches"} at {formatPence(750)} each,
            <span className="font-semibold text-white"> {formatPence(branches.extraCostPence)}/mo</span>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-white/60">
            Your plan includes {branches.included} {branches.included === 1 ? "branch" : "branches"}. Extra branches
            are {formatPence(750)} each per month. Contact us to add a branch.
          </p>
        )}
      </section>

      {/* Payment method + actions */}
      {isSub && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Payment and invoices</h2>
          {activeSub ? (
            <>
              <p className="mt-2 text-sm text-white/70">
                Your subscription is {pill.text.toLowerCase()}.
                {billing?.cancel_at_period_end && periodEnd
                  ? ` It will end on ${periodEnd}.`
                  : periodEnd
                    ? ` Your next payment date is ${periodEnd}.`
                    : ""}
              </p>
              <div className="mt-4">
                <ManageBillingButton variant="primary" />
              </div>
              <p className="mt-2 text-xs text-white/40">
                Update your card, view invoices or cancel in the secure billing
                portal.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-white/70">
                {hasSubscription
                  ? "Your subscription is not active. Restart it to keep using paid features."
                  : "Add a card to activate your subscription. Your first payment covers the base plan plus any extra seats."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <SubscribeButton />
                {billing?.stripe_customer_id && <ManageBillingButton />}
              </div>
            </>
          )}
        </section>
      )}

      {tier === "black" && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Payment and invoices</h2>
          <p className="mt-2 text-sm text-white/70">
            There is nothing to pay on the Black plan.
          </p>
        </section>
      )}
    </div>
  );
}
