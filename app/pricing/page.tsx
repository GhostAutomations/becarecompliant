import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import PricingTiers from "@/components/marketing/pricing-tiers";

export const metadata: Metadata = {
  title: "Pricing | Be Care Compliant",
  description:
    "Simple per service pricing for Be Care Compliant. Business, Pro and Enterprise plans, each with a 14 day free trial. Four users included, then £5 per extra user per month.",
};

export default async function PricingPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      <section className="mx-auto max-w-6xl px-4 pb-8 pt-20 text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">Pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
          One plan per care service. Every plan starts with a 14 day free trial, and you can change plan as you grow.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <PricingTiers />
      </section>

      <section className="border-t border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold">Need a bespoke arrangement?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">
            For larger groups, usage based plans or partner arrangements, talk to us and we will find the right fit.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/start-trial" className="btn-primary">Start free trial</Link>
            <Link href="/start-trial" className="btn-outline">Talk to us</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
