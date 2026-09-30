import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { getCompanyBilling } from "@/lib/billing/stripe-sync";
import { getStripe } from "@/lib/stripe/client";
import { money } from "@/lib/legal/fill";

/**
 * Where "Get an invoice instead" lands (test I4, 2026-09-30). It used to show a "Sent" panel in
 * place of the button, but the action re-renders the payment step, which then sees a live
 * subscription and moves on to the dashboard, so nobody ever saw the panel or its link.
 *
 * This page reads the invoice back from Stripe, so it is right on a refresh too, and it says
 * plainly when Stripe has not finished it yet rather than showing a dead link.
 */

export const metadata: Metadata = { title: "Invoice sent" };

function dueText(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default async function InvoiceSentPage() {
  const { profile } = await requireProfile();
  if (profile.role === "platform_admin") redirect("/founder");
  if (!profile.company_id) redirect("/login?reason=no-access");
  if (profile.role !== "company_admin") redirect("/dashboard");

  const billing = await getCompanyBilling(profile.company_id);
  if (!billing?.stripe_subscription_id) redirect("/agreement/payment");

  let url: string | null = null;
  let pdf: string | null = null;
  let email: string | null = null;
  let amount: string | null = null;
  let due: string | null = null;
  let paid = false;
  const stripe = getStripe();
  if (stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(billing.stripe_subscription_id, { expand: ["latest_invoice"] });
      const inv = sub.latest_invoice && typeof sub.latest_invoice !== "string" ? sub.latest_invoice : null;
      if (inv) {
        url = inv.hosted_invoice_url ?? null;
        pdf = inv.invoice_pdf ?? null;
        email = inv.customer_email ?? null;
        amount = money(inv.amount_due ?? 0);
        due = dueText(inv.due_date);
        paid = inv.status === "paid";
      }
    } catch (e) {
      console.error("[billing] invoice-sent read failed:", (e as Error).message);
    }
  }

  return (
    <main className="app-bg min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="glass-card p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-300">Step 4 of 4</p>
          <h1 className="mt-1 text-xl font-semibold text-white">{paid ? "Invoice paid" : "Invoice sent"}</h1>
          {paid ? (
            <p className="mt-2 text-sm text-white/70">Thank you, your invoice has been paid.</p>
          ) : url ? (
            <p className="mt-2 text-sm text-white/70">
              Your invoice{amount ? ` for ${amount}` : ""} is on its way to {email ?? "your email"}. It is payable
              {due ? ` by ${due}` : " within 14 days"}, by card or by bank transfer to the account details on the invoice.
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/70">
              Your subscription is set up and your invoice is being prepared. It will be emailed to you within the hour,
              payable within 14 days by card or bank transfer. You will also find it in Settings, Billing.
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {url && !paid ? (
              <a href={url} target="_blank" rel="noreferrer" className="btn btn-outline text-sm">
                View and pay the invoice
              </a>
            ) : null}
            {pdf ? (
              <a href={pdf} target="_blank" rel="noreferrer" className="btn btn-outline text-sm">
                Download the PDF
              </a>
            ) : null}
            <a href="/dashboard" className="btn btn-primary text-sm">
              Continue
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
