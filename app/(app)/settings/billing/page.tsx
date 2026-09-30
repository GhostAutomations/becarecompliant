import type { Metadata } from "next";
import Link from "next/link";
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
  orderedExtrasOnTier,
  orderedExtrasForDisplay,
} from "@/lib/billing/seats";
import ActionForm from "@/components/action-form";
import { upgradeToPro } from "@/lib/billing/actions";
import { getDeal } from "@/lib/billing/deal-store";
import { branchBands, branchWord, dealIntervals, dealMonthlyParts, lower } from "@/lib/billing/deal";
import { billedExtra } from "@/lib/billing/ordered-extras";
import { getAiCreditBalance } from "@/lib/billing/ai-credits";
import { getSmsCreditBalance } from "@/lib/billing/sms-credits";
import { SMS_TOPUP_CREDITS, SMS_TOPUP_PENCE, smsTopupPriceId } from "@/lib/stripe/config";
import { TIER_LABELS, TIER_BASE_PENCE, isSubscriptionTier, YEARLY_MONTHS_CHARGED } from "@/lib/stripe/config";
import { billingIntervals } from "@/lib/billing/stripe-sync";
import { stripeConfigured } from "@/lib/stripe/client";
import {
  SubscribeButton,
  ManageBillingButton,
  TopUpCreditsButton,
  TopUpSmsButton,
} from "@/components/billing/billing-actions";
import BackLink from "@/components/back-link";
import { aiMonthlyCredits, smsMonthlyCredits } from "@/lib/billing/allowances";
import { isDemoCompany } from "@/lib/demo/data";

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
  // Logins, roles and billing are switched off in a demo (0356); the founder managing as it may look.
  if (profile.role !== "platform_admin" && (await isDemoCompany(profile.company_id))) redirect("/settings");
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const [{ data: company }, seats, { data: billing }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, tier, status, branch_word, branch_word_plural")
      .eq("id", profile.company_id)
      .maybeSingle(),
    getSeatUsage(profile.company_id),
    supabase
      .from("company_billing")
      .select(
        "stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, seat_quantity, billing_interval, extras_interval",
      )
      .eq("company_id", profile.company_id)
      .maybeSingle(),
  ]);

  const tier = company?.tier ?? "business";
  const branches = await getBranchUsage(profile.company_id, tier);
  const aiCredits = await getAiCreditBalance(profile.company_id);
  const smsCredits = await getSmsCreditBalance(profile.company_id);
  // One source for what each plan includes (lib/billing/allowances.ts), shared with the Order.
  const aiMonthly = aiMonthlyCredits(tier);
  const smsMonthly = smsMonthlyCredits(tier);
  const smsTopupReady = Boolean(smsTopupPriceId());
  const isSub = isSubscriptionTier(tier);
  /* THE DEAL (0354): the plan, extra user and extra branch prices agreed with them, where set;
     the list prices otherwise. A two-step branch price is shown as two lines. */
  const deal = isSub ? await getDeal(supabase, profile.company_id) : null;
  const parts = dealMonthlyParts(
    deal,
    { planPence: isSub ? TIER_BASE_PENCE[tier as keyof typeof TIER_BASE_PENCE] : 0, seatPence: EXTRA_SEAT_PENCE, branchPence: EXTRA_BRANCH_PENCE },
    seats.extra,
    branches.extra,
  );
  const unit = parts.prices;
  seats.extraCostPence = parts.seatsPence;
  branches.extraCostPence = parts.branchesPence;
  const [branchesFirst, branchesRest] = branchBands(branches.extra, unit.step);
  // Their own word for a branch (0354), e.g. House / Houses.
  const word = branchWord(company as { branch_word?: string | null; branch_word_plural?: string | null } | null);
  const wOne = lower(word.one);
  const wMany = lower(word.many);
  const basePence = isSub ? parts.basePence : 0;
  // Extra BRANCHES are part of the bill now (THE LIST item 16), so they belong in the total.
  // Until this line, the page listed "1 extra branch at £7.50, £7.50/mo" and then totalled
  // £69.00 — which was survivable only while nothing actually charged for a branch. The moment
  // it does, that page is telling a customer £69 and Stripe is taking £76.50. This product has
  // already been bitten once by a screen and an invoice disagreeing (£69 sold, £99 charged).
  /* ANNUAL (2026-09-30): a company paying yearly sees yearly amounts, ten months' price for
     twelve, and its extras yearly or monthly as it chose. Monthly companies see what they always
     did. The upgrade to Pro below still quotes monthly figures for comparison. */
  // Before the subscription exists, the intervals come from their deal (D1, 2026-09-30).
  const intervals = billing?.billing_interval
    ? billingIntervals(billing as { billing_interval?: string | null; extras_interval?: string | null } | null)
    : dealIntervals(deal) ?? billingIntervals(null);
  const planYearly = intervals.plan === "year";
  const extrasYearly = intervals.extras === "year";
  const times = (yearly: boolean) => (yearly ? YEARLY_MONTHS_CHARGED : 1);
  const monthlyTotalPence = basePence + parts.seatsPence + parts.branchesPence;

  /* WHAT PRO WOULD ACTUALLY COST THEM, worked out from their own numbers rather than quoted as
     a headline price. Pro includes 6 users and 2 branches against Business's 4 and 1, so an
     upgrade can REDUCE the extras bill at the same time as it raises the base, and the only
     honest thing to show somebody is the new total. */
  // A plan price agreed in their deal is for Business only; changing plan goes through us (tier-apply refuses it too).
  const canUpgradeToPro = tier === "business" && !(deal?.plan_price_pence != null);
  // On Pro the Order's extras are counted against Pro's allowance (DEF-083 floor, 2026-09-30).
  const orderedOnPro = orderedExtrasOnTier(await orderedExtrasForDisplay(profile.company_id), "pro");
  const proSeatExtra = billedExtra(Math.max(0, seats.used - includedSeatsForTier("pro")), orderedOnPro.users);
  const proBranchExtra = billedExtra(Math.max(0, branches.used - includedBranchesForTier("pro")), orderedOnPro.branches);
  // Their agreed extra user and branch prices carry over to Pro (0354).
  const proParts = dealMonthlyParts(
    deal,
    { planPence: TIER_BASE_PENCE.pro, seatPence: EXTRA_SEAT_PENCE, branchPence: EXTRA_BRANCH_PENCE },
    proSeatExtra,
    proBranchExtra,
  );
  const proExtrasPence = proParts.seatsPence + proParts.branchesPence;
  const proTotalPence = TIER_BASE_PENCE.pro + proExtrasPence;

  /* WHAT THEY PAY, LIKE AN INVOICE, IN THE PLAN CARD (Phil, 2026-09-30: the cost sat in the Seats
     card, "that doesn't make any sense"). Same shape as the Order on the agreement screen: the
     plan, each extra, then the total, in the interval each is actually charged. No bold. */
  const seatLinePence = seats.extraCostPence * times(extrasYearly);
  const branchLinePence = branches.extraCostPence * times(extrasYearly);
  const planLinePence = basePence * times(planYearly);
  const extrasEach = extrasYearly ? ` x ${YEARLY_MONTHS_CHARGED} months` : "";
  const yearlyExtrasInTotal = planYearly && extrasYearly;
  const planTotalPence = planYearly
    ? planLinePence + (yearlyExtrasInTotal ? seatLinePence + branchLinePence : 0)
    : monthlyTotalPence;
  const monthlyExtrasOnAnnualPence = planYearly && !extrasYearly ? seatLinePence + branchLinePence : 0;

  // What Move to Pro would cost, in the interval they pay (yearly figures for Annual).
  const nowComparePence = planYearly
    ? planTotalPence
    : monthlyTotalPence;
  const proComparePence = planYearly
    ? TIER_BASE_PENCE.pro * YEARLY_MONTHS_CHARGED +
      (extrasYearly ? proExtrasPence * YEARLY_MONTHS_CHARGED : 0)
    : proTotalPence;
  const proMonthlyExtrasOnAnnualPence =
    planYearly && !extrasYearly ? proExtrasPence : 0;
  const compareUnit = planYearly ? "a year" : "a month";
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

  /* The extra branch lines, one per price step (0354), in their word. */
  const branchLines = (suffix: string, months: number) =>
    [
      [branchesFirst, unit.branchPence],
      [branchesRest, unit.step?.pricePence ?? unit.branchPence],
    ]
      .filter(([n]) => n > 0)
      .map(([n, price]) => (
        <div key={`${n}-${price}`} className="flex justify-between gap-3">
          <span>
            {n} extra {n === 1 ? wOne : wMany} x {formatPence(price)}
            {suffix}
          </span>
          <span>{formatPence(n * price * months)}</span>
        </div>
      ));

  return (
    <div className="page-shell space-y-6">
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
        {isSub ? (
          <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm text-white/70">
            <p className="text-xs text-white/50">{planYearly ? "Your yearly cost" : "Your monthly cost"}</p>
            <div className="flex justify-between gap-3">
              <span>
                {TIER_LABELS[tier as keyof typeof TIER_LABELS]} plan{planYearly ? ", paid yearly" : ""}
              </span>
              <span>{formatPence(planLinePence)}</span>
            </div>
            {yearlyExtrasInTotal || !planYearly ? (
              <>
                {seats.extra > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>
                      {seats.extra} extra {seats.extra === 1 ? "user" : "users"} x {formatPence(unit.seatPence)}
                      {extrasEach}
                    </span>
                    <span>{formatPence(seatLinePence)}</span>
                  </div>
                ) : null}
                {branchLines(extrasEach, times(extrasYearly))}
              </>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2 text-white">
              <span>{planYearly ? "Total each year, plus VAT" : "Total each month, plus VAT"}</span>
              <span>{formatPence(planTotalPence)}</span>
            </div>
            {monthlyExtrasOnAnnualPence > 0 ? (
              <>
                <p className="pt-3 text-xs text-white/50">Your monthly cost</p>
                {seats.extra > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>
                      {seats.extra} extra {seats.extra === 1 ? "user" : "users"} x {formatPence(unit.seatPence)}
                    </span>
                    <span>{formatPence(seatLinePence)}</span>
                  </div>
                ) : null}
                {branchLines("", 1)}
                <div className="flex justify-between gap-3 border-t border-white/10 pt-2 text-white">
                  <span>Total each month, plus VAT</span>
                  <span>{formatPence(monthlyExtrasOnAnnualPence)}</span>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
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

      {/* Seats: what is used (the cost is in the plan card) */}
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
            {seats.extra > 0 ? (
              <p>
                You pay for {seats.extra} extra {seats.extra === 1 ? "user" : "users"}, so up to{" "}
                {seats.included + seats.extra} users are covered.
              </p>
            ) : null}
            <p className="pt-1 text-xs text-white/40">
              {extrasYearly
                ? `Each extra user is ${formatPence(unit.seatPence * YEARLY_MONTHS_CHARGED)} a year (${formatPence(unit.seatPence)} x ${YEARLY_MONTHS_CHARGED} months). Adding one charges the rest of your current year straight away; removing one takes effect from your renewal.`
                : `Each extra user is ${formatPence(unit.seatPence)} a month. Changes are prorated onto your next invoice.`}
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
            {includedSeatsForTier("pro")} users and {includedBranchesForTier("pro")} {wMany}{" "}
            instead of {seats.included} and {branches.included}.
          </p>
          <div className="mt-3 space-y-1 text-sm text-white/70">
            <div className="flex justify-between">
              <span>You pay now</span>
              <span>
                {formatPence(nowComparePence)} {compareUnit}
              </span>
            </div>
            <div className="flex justify-between text-white">
              <span>On Pro</span>
              <span>
                {formatPence(proComparePence)} {compareUnit}
              </span>
            </div>
            {monthlyExtrasOnAnnualPence > 0 || proMonthlyExtrasOnAnnualPence > 0 ? (
              <p className="text-xs text-white/50">
                Plus your extras each month: {formatPence(monthlyExtrasOnAnnualPence)} now,{" "}
                {formatPence(proMonthlyExtrasOnAnnualPence)} on Pro.
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-white/40">
            {!willBeProrated
              ? "Nothing is charged until you subscribe."
              : planYearly
                ? "The difference for the rest of your current year is charged straight away."
                : "The difference is prorated onto your next invoice, so you only pay for the rest of this month."}
          </p>
          <div className="mt-4">
            <ActionForm
              action={upgradeToPro}
              label="Move to Pro"
              savedLabel="On Pro"
              confirm={`Move to Pro? Your total goes from ${formatPence(nowComparePence)} to ${formatPence(proComparePence)} ${compareUnit}${!willBeProrated ? ". Nothing is charged until you subscribe" : planYearly ? ", and the difference for the rest of this year is charged now" : ", prorated onto your next invoice"}.`}
            />
          </div>
        </section>
      ) : null}

      {/* Branches */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">{word.many}</h2>
        <p className="mt-2 text-3xl font-bold text-white">
          {branches.used}
          <span className="text-base font-medium text-white/50"> of {branches.included} included</span>
        </p>
        {branches.extra > 0 ? (
          <p className="mt-3 text-sm text-white/70">
            You pay for {branches.extra} extra {branches.extra === 1 ? wOne : wMany}, so up to{" "}
            {branches.included + branches.extra} {wMany} are covered.
          </p>
        ) : null}
        <p className="mt-3 text-sm text-white/60">
          {unit.step
            ? `The first ${unit.step.after} extra ${unit.step.after === 1 ? wOne : wMany} are ${formatPence(unit.branchPence * times(extrasYearly))} each, then ${formatPence(unit.step.pricePence * times(extrasYearly))} each after that, a ${extrasYearly ? "year" : "month"}. Contact us to add a ${wOne}.`
            : extrasYearly
              ? `Each extra ${wOne} is ${formatPence(unit.branchPence * YEARLY_MONTHS_CHARGED)} a year (${formatPence(unit.branchPence)} x ${YEARLY_MONTHS_CHARGED} months). Contact us to add a ${wOne}.`
              : `Each extra ${wOne} is ${formatPence(unit.branchPence)} a month. Contact us to add a ${wOne}.`}
        </p>
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

      {/* The agreement (0346): what was accepted, by whom and when, and the two documents. */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Your agreement</h2>
        <p className="mt-2 text-sm text-white/60">
          The Subscription Agreement and Data Processing Agreement your company has accepted, and the
          details on your Order.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/agreement" className="btn-ghost px-3 py-2 text-xs">
            View your agreement
          </Link>
        </div>
      </section>
    </div>
  );
}
