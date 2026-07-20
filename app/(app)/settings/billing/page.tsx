import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getSeatUsage, getBranchUsage, formatPence } from "@/lib/billing/seats";
import { getAiCreditBalance } from "@/lib/billing/ai-credits";
import { TIER_LABELS, TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import { stripeConfigured } from "@/lib/stripe/client";
import { SubscribeButton, ManageBillingButton, TopUpCreditsButton } from "@/components/billing/billing-actions";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Billing" };

const TIER_BLURB: Record<string, string> = {
  business:
    "Core compliance: People and Service User registers, checks, forms, RAG status and email reminders.",
  pro: "Everything in Business, plus SMS reminders, reporting and inspector ready exports, and the form builder.",
  enterprise:
    "Everything in Pro, plus AI assistance, the integration layer and priority support.",
  diamond:
    "Everything included. You are billed for usage only: SMS and AI, with no monthly subscription.",
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
  const AI_ALLOWANCE: Record<string, number> = { business: 25, pro: 50, enterprise: 50, diamond: 50, black: 1000 };
  const aiMonthly = AI_ALLOWANCE[tier] ?? 25;
  const isSub = isSubscriptionTier(tier);
  const basePence = isSub ? TIER_BASE_PENCE[tier as keyof typeof TIER_BASE_PENCE] : 0;
  const monthlyTotalPence = basePence + seats.extraCostPence;
  const hasSubscription = Boolean(billing?.stripe_subscription_id);
  const activeSub = ["active", "trialing", "past_due"].includes(
    billing?.subscription_status ?? "",
  );
  const pill = statusPill(billing?.subscription_status ?? null);
  const periodEnd = billing?.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  // Diamond: show this month's metered usage.
  let usageThisMonth: { sms: number; ai: number; costPence: number } | null = null;
  if (tier === "diamond") {
    const { data: usage } = await supabase
      .from("usage_monthly")
      .select("kind, month, units_sum, cost_pence_sum")
      .eq("company_id", profile.company_id)
      .order("month", { ascending: false })
      .limit(2);
    const rows = usage ?? [];
    const month = rows[0]?.month ?? null;
    const cur = month ? rows.filter((r) => r.month === month) : [];
    usageThisMonth = {
      sms: Number(cur.find((r) => r.kind === "sms")?.units_sum ?? 0),
      ai: Number(cur.find((r) => r.kind === "ai")?.units_sum ?? 0),
      costPence: cur.reduce((s, r) => s + Number(r.cost_pence_sum ?? 0), 0),
    };
  }

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
            <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
              <span>Estimated monthly total</span>
              <span>{formatPence(monthlyTotalPence)}/mo</span>
            </div>
            <p className="pt-1 text-xs text-white/40">
              Each user beyond the first {seats.included} is {formatPence(500)} per
              month. Changes are prorated onto your next invoice.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/60">
            {tier === "diamond"
              ? "Users are included. You are billed for usage only."
              : "All users are included at no charge on the Black plan."}
          </p>
        )}
      </section>

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

      {/* Diamond usage */}
      {tier === "diamond" && usageThisMonth && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Usage this month</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-white">{usageThisMonth.sms}</p>
              <p className="text-xs text-white/50">SMS segments</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{usageThisMonth.ai}</p>
              <p className="text-xs text-white/50">AI tokens</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/60">
            Metered usage is invoiced at the end of each calendar month.
          </p>
        </section>
      )}

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

      {(tier === "diamond" || tier === "black") && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Payment and invoices</h2>
          <p className="mt-2 text-sm text-white/70">
            {tier === "black"
              ? "There is nothing to pay on the Black plan."
              : "You are billed for usage only. Manage your card and view invoices in the billing portal."}
          </p>
          {tier === "diamond" && billing?.stripe_customer_id && (
            <div className="mt-4">
              <ManageBillingButton variant="primary" />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
