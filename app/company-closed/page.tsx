import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { getCompanyTrialState } from "@/lib/billing/trial-gate";
import { companyIsLocked } from "@/lib/companies/deletion";

/**
 * The screen a company sees when its account has been shut — suspended, archived or deleted.
 *
 * It sits OUTSIDE the (app) group for the same reason /trial-ended does: inside it, the whole
 * navigation would still be there with every link bouncing straight back here, which reads as a
 * broken app rather than a clear answer.
 *
 * requireProfile, NOT requireCompany: requireCompany is what sent them here, so calling it again
 * would be a redirect loop.
 *
 * It does not say WHICH of the three states they are in, and that is deliberate. "Suspended"
 * invites an argument with whoever is on the phone; "your account has been closed, here is who
 * to speak to" is the same information without inviting one. Nothing here is a threat and
 * nothing here promises their data is gone, because until a deleted company is purged it is not.
 */

export const metadata: Metadata = { title: "Account closed" };

export default async function CompanyClosedPage() {
  const { profile } = await requireProfile();
  if (profile.role === "platform_admin") redirect("/founder");
  if (!profile.company_id) redirect("/login?reason=no-access");

  const state = await getCompanyTrialState(profile.company_id);
  // Anybody who lands here with a working company belongs in the app.
  if (!companyIsLocked(state.companyStatus)) redirect("/dashboard");

  return (
    <main className="app-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-lg p-8">
        <h1 className="text-xl font-semibold text-white">This account is closed</h1>
        <p className="mt-3 text-sm text-white/70">
          The Be Care Compliant account for {state.companyName} is no longer open, so nobody
          there can sign in at the moment. If you think that is a mistake, speak to whoever runs
          your account, or email{" "}
          <a className="text-gold-300 hover:underline" href="mailto:support@becarecompliant.com">
            support@becarecompliant.com
          </a>
          .
        </p>
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
