import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { getCompanyTrialState } from "@/lib/billing/trial-gate";
import { SubscribeButton } from "@/components/billing/billing-actions";

/**
 * The end of a 14 day trial.
 *
 * It sits OUTSIDE the (app) group on purpose. Inside it, the whole navigation would still
 * be there, every link bouncing straight back here, which reads as a broken app rather than
 * a clear answer. This is one page that says what has happened, what is safe, and the one
 * thing that fixes it.
 *
 * requireProfile, NOT requireCompany: requireCompany is what sent them here, so calling it
 * again would be a redirect loop. The two billing actions pass allowLapsed for the same
 * reason, since they are the way out.
 *
 * Nothing is deleted when a trial ends. The lock is commercial, not a retention policy: the
 * records, forms and evidence are all exactly where they were, and adding a card restores
 * access immediately, because the Stripe webhook clears the trial date the moment the
 * subscription goes live.
 */

export const metadata: Metadata = { title: "Trial ended" };

export default async function TrialEndedPage() {
  const { profile } = await requireProfile();
  if (profile.role === "platform_admin") redirect("/founder");
  if (!profile.company_id) redirect("/login?reason=no-access");

  const trial = await getCompanyTrialState(profile.company_id);
  // Anybody who lands here with a live trial or a subscription belongs in the app.
  if (trial.status !== "expired") redirect("/dashboard");

  const isAdmin = profile.role === "company_admin";
  const endedOn = trial.endsAt
    ? new Date(trial.endsAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      })
    : null;

  return (
    <main className="app-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-lg p-8">
        <h1 className="text-xl font-semibold text-white">Your free trial has ended</h1>
        <p className="mt-3 text-sm text-white/70">
          {endedOn
            ? `The trial for ${trial.companyName} ended on ${endedOn}.`
            : `The trial for ${trial.companyName} has ended.`}{" "}
          Nothing has been deleted. Every person, service user, check and piece of evidence
          is exactly where you left it, and it all comes straight back as soon as there is a
          card on the account.
        </p>

        {isAdmin ? (
          <div className="mt-6 space-y-3">
            <SubscribeButton label="Add a card and carry on" />
            <p className="text-xs text-white/50">
              Payment is taken by Stripe, so card details never touch our servers. You can
              change or cancel it at any time from Settings, Billing.
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
            Only a Company Admin can set up billing, so please ask whoever runs your
            Be Care Compliant account to add a card. As soon as they do, your access
            returns.
          </p>
        )}

        <div className="mt-8 border-t border-white/10 pt-4">
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
