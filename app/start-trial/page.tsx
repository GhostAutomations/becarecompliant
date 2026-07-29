import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import TrialRequestForm from "@/components/marketing/trial-request-form";

export const metadata: Metadata = {
  title: "Start your free trial | Be Care Compliant",
  description:
    "Request a 14 day free trial of Be Care Compliant. Three details, no card, and we set the trial up for you and send your logins, usually the same working day.",
};

const VALID_TIERS = new Set(["business", "pro"]);

const STEPS = [
  "Tell us about your service",
  "We set the trial up and send your logins",
  "Bring your records in and see what is due",
];

export default async function StartTrialPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  const defaultTier = sp.tier && VALID_TIERS.has(sp.tier) ? sp.tier : "";

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      <section className="mx-auto max-w-2xl px-4 pb-20 pt-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">Start your 14 day free trial</h1>
          <p className="mx-auto mt-4 max-w-xl text-white/75">
            Three details is all we need. We set the trial up for you and send your logins, usually the same working
            day. No card, and nothing goes live until you have your logins.
          </p>
        </div>

        <ol className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s} className="glass-card flex items-start gap-3 p-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-xs font-bold text-gold-300">
                {i + 1}
              </span>
              <span className="text-sm text-white/80">{s}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <TrialRequestForm defaultTier={defaultTier} />
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-white/60">
          We use these details only to set your trial up and to contact you about it. We do not sell them on and we
          do not need any information about the people you support in order to get you started.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
