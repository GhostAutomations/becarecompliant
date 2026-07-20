import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import TrialRequestForm from "@/components/marketing/trial-request-form";

export const metadata: Metadata = {
  title: "Start your free trial | Be Care Compliant",
  description:
    "Request a 14 day free trial of Be Care Compliant. Tell us about your care service and we will set you up. No card needed.",
};

const VALID_TIERS = new Set(["business", "pro"]);

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
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Tell us a little about your care service. We will set your trial up and send your login, usually the same
            working day. No card needed.
          </p>
        </div>
        <div className="mt-10">
          <TrialRequestForm defaultTier={defaultTier} />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
