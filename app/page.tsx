import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import PricingTiers from "@/components/marketing/pricing-tiers";
import ProductPreview from "@/components/marketing/product-preview";

const TRUST = ["CQC in England", "CIW in Wales", "Local authority monitoring", "UK data, kept private"];

export const metadata: Metadata = {
  title: "Be Care Compliant | CQC and CIW compliance software for care providers",
  description:
    "The purpose built compliance platform for UK care providers. Track staff and service user compliance, stay inspection ready for CQC and CIW, and hand inspectors the evidence in one click.",
};

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "People and Service Users, kept apart",
    body: "Two clear registers, your staff team and the people you care for, each with their own checks, due dates and evidence.",
  },
  {
    title: "Checks that update themselves",
    body: "Complete a form against a record and everything updates itself: the check completes, the date is stamped, the evidence is stored and the next due date is set. No manual date keeping, ever.",
  },
  {
    title: "Red, amber, green at a glance",
    body: "Every check is compliant, due soon or overdue, and it rolls up from the check to the record, the branch and the whole company. Know if you are inspection ready in one look, then reach the exact overdue item in two clicks.",
  },
  {
    title: "Evidence inspectors can trust",
    body: "Completed forms are stored as timestamped evidence with the author and the form version used. Export inspection ready reports as PDF or CSV the moment they are asked for.",
  },
  {
    title: "Reminders that chase for you",
    body: "A daily digest and reminders keep nothing slipping through, so supervisions, reviews and renewals are done on time, not discovered late.",
  },
  {
    title: "Your forms, your way",
    body: "Start from a founder curated library of care templates, then build and version your own forms with the built in form builder.",
  },
];

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "1",
    title: "Add your people and service users",
    body: "Bring your team and the people you support into two clean registers, or bulk import an existing service you have taken on.",
  },
  {
    n: "2",
    title: "Your checks schedule themselves",
    body: "Supervisions, appraisals, spot checks, care plan reviews, risk assessments and more are applied and dated automatically.",
  },
  {
    n: "3",
    title: "Stay inspection ready",
    body: "Complete forms as you go, watch the red, amber, green picture stay green, and export the evidence the moment an inspector asks.",
  },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is this built for CQC and CIW?",
    a: "Yes. Be Care Compliant is built for UK care providers under CQC in England and CIW in Wales, and for local authority contract monitoring.",
  },
  {
    q: "Do we have to move off our spreadsheets?",
    a: "You can bring existing records in with a bulk import, including historic completed dates, so you start with an accurate picture from day one.",
  },
  {
    q: "How does the free trial work?",
    a: "Tell us about your service and we set up a 14 day trial for you with your logins. No card is needed to start.",
  },
  {
    q: "Is our data safe?",
    a: "Service user information is treated as the most sensitive data in the platform, with strict tenant and role separation, audit logging and files served only over short lived secure links.",
  },
];

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:pt-28">
        <span className="inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
          Compliance software for UK care providers
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Inspection ready, <span className="text-gold-400">every day.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/70">
          The compliance platform built for UK care providers. Track every check, stay ready for CQC and CIW,
          and hand inspectors the evidence in one click. No spreadsheets, no wall charts, no last minute scramble.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/start-trial" className="btn-primary">Start your 14 day free trial</Link>
          <Link href="/pricing" className="btn-outline">See pricing</Link>
        </div>
        <p className="mt-4 text-xs text-white/45">No card needed. Set up for you, ready to use.</p>

        <div className="mx-auto mt-10 max-w-4xl">
          <ProductPreview />
        </div>

        <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/55">
          {TRUST.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span aria-hidden className="text-gold-400">&#10003;</span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      {/* Problem */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Compliance should not live in a spreadsheet</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            Care services face constant inspection pressure, yet most track it in spreadsheets, wall charts or
            tools that were never built for care. Things slip, evidence is scattered, and inspection day means a
            scramble. There is a calmer way to run your whole compliance calendar.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Everything a registered manager needs</h2>
          <p className="mt-3 text-white/70">Simple enough to run your service from, thorough enough for an inspector.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card glass-card-hover p-6">
              <span aria-hidden className="block h-1 w-10 rounded-full bg-gold-400" />
              <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-white/75">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">Up and running in three steps</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="glass-card p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-400/15 text-sm font-bold text-gold-300">
                  {s.n}
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-white/70">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Simple, per service pricing</h2>
          <p className="mt-3 text-white/70">Every plan starts with a 14 day free trial.</p>
        </div>
        <div className="mt-12">
          <PricingTiers />
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Questions, answered</h2>
          <div className="mt-10 space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white">{f.q}</h3>
                <p className="mt-2 text-sm text-white/70">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">See your service go green</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          Start a free trial and run your whole compliance calendar in one place, ready for your next inspection.
        </p>
        <div className="mt-8">
          <Link href="/start-trial" className="btn-primary">Start your 14 day free trial</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
