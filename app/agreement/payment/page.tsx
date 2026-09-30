import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { getCompanyTrialState } from "@/lib/billing/trial-gate";
import { getCompanyBilling } from "@/lib/billing/stripe-sync";
import { listAcceptances } from "@/lib/legal/acceptance";
import { legalPublished, LEGAL_VERSIONS } from "@/lib/legal/documents";
import { acceptanceCurrent, afterAcceptPath, isLiveSubscription } from "@/lib/legal/fill";
import { SubscribeButton } from "@/components/billing/billing-actions";

/**
 * Step 4 of accepting the agreement: payment (Phil, 2026-09-30, by popup: "the very next screen
 * should be the payment screen not a small section above welcome").
 *
 * Accept sends a Company Admin here when their plan has to be paid for and nothing is paying for it
 * yet (afterAcceptPath). What it shows follows the billing option on the Order they just accepted:
 *
 *   Monthly  the plan and price, and Add a card (the same Stripe Checkout as Settings, Billing).
 *            A company still in its free trial may leave it for now; one that is not has no skip.
 *   Annual   the first year's amount and that the invoice comes by email, payable within 14 days
 *            by card or bank transfer (clause 7.2), then Continue.
 *
 * Outside (app), like /agreement and Trial ended, so the app's navigation cannot bounce around it.
 * Anyone it does not apply to (another role, a Black account, a company already paying, or one
 * with nothing accepted yet) is sent where they belong instead of seeing an empty step.
 */

export const metadata: Metadata = { title: "Payment" };

export default async function AgreementPaymentPage() {
  const { profile } = await requireProfile();
  if (profile.role === "platform_admin") redirect("/founder");
  if (!profile.company_id) redirect("/login?reason=no-access");
  if (profile.role !== "company_admin") redirect("/dashboard");

  const companyId = profile.company_id;
  const trial = await getCompanyTrialState(companyId);
  if (trial.companyStatus !== "active") redirect("/company-closed");

  const [acceptances, billing] = await Promise.all([listAcceptances(companyId), getCompanyBilling(companyId)]);
  const current = acceptances.find((a) => acceptanceCurrent([a], LEGAL_VERSIONS, legalPublished()));
  if (!current) redirect("/agreement");

  const live = isLiveSubscription(billing?.subscription_status, billing?.stripe_subscription_id);
  if (afterAcceptPath({ tier: trial.tier, liveSubscription: live }) === "/dashboard") redirect("/dashboard");

  const inTrial = trial.status === "trialing" || trial.status === "ending_soon";
  const annual = current.billing_option === "annual";
  const days = trial.daysLeft ?? 0;

  return (
    <main className="app-bg min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="glass-card p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-300">Step 4 of 4</p>
          <h1 className="mt-1 text-xl font-semibold text-white">Payment</h1>
          <p className="mt-2 text-sm text-white/70">
            Thank you, {current.accepted_by_name}. {current.customer_legal_name} has accepted the agreement.
            {annual ? " Here is how your first year is paid." : " Add a card to start your subscription."}
          </p>

          <dl className="mt-5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-white/55">Plan</dt>
            <dd className="text-white/85">{current.plan}</dd>
            <dt className="text-white/55">Plan price</dt>
            <dd className="text-white/85">{current.price_text ?? "As shown on your Order"}</dd>
            <dt className="text-white/55">Extra users</dt>
            <dd className="text-white/85">{current.extra_users_text ?? "None"}</dd>
            <dt className="text-white/55">Extra branches</dt>
            <dd className="text-white/85">{current.branches_text ?? "None"}</dd>
            {current.extras_paid_text ? (
              <>
                <dt className="text-white/55">Extras paid</dt>
                <dd className="text-white/85">{current.extras_paid_text}</dd>
              </>
            ) : null}
            <dt className="text-white/55">Total</dt>
            <dd className="text-white">{current.total_text ?? current.price_text ?? "As shown on your Order"}</dd>
            <dt className="text-white/55">Onboarding fee</dt>
            <dd className="text-white/85">{current.onboarding_fee}</dd>
            {current.price_list_date ? (
              <>
                <dt className="text-white/55">Extras</dt>
                <dd className="text-white/85">{current.price_list_date}</dd>
              </>
            ) : null}
          </dl>

          {annual ? (
            <div className="mt-6 space-y-4">
              <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
                We will email your first year&apos;s invoice to {profile.email}. It is payable within 14 days, by card
                or bank transfer.
                {current.extras_billing === "monthly"
                  ? " Your extras are paid monthly by card: we will email you a secure link to add a card."
                  : ""}{" "}
                You can start using Be Care Compliant straight away.
              </p>
              <Link href="/dashboard" className="btn btn-primary">
                Continue
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-white/70">
                You will be taken to our secure payment page, run by Stripe. Your card details never reach us.
              </p>
              <SubscribeButton label="Add a card" />
              {inTrial ? (
                <p className="text-sm">
                  <Link
                    href="/dashboard"
                    className="text-gold-300 underline underline-offset-4 hover:text-gold-400"
                  >
                    Not yet, I&apos;m in my free trial ({days} {days === 1 ? "day" : "days"} left)
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-ghost px-3 py-2 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
