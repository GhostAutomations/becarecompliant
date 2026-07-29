import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import PricingTable from "@/components/marketing/pricing-table";
import ProductPreview from "@/components/marketing/product-preview";
import Comparison from "@/components/marketing/comparison";
import PqsReportPreview from "@/components/marketing/pqs-report-preview";
import FeatureSpotlights from "@/components/marketing/feature-spotlights";
import Outcomes from "@/components/marketing/outcomes";
import SocialProof from "@/components/marketing/social-proof";
import Reveal from "@/components/marketing/reveal";

const TRUST = [
  "CQC in England",
  "CIW in Wales",
  "Local authority PQS returns",
  "Audit trail on every record",
];

const EDGES: Array<{ title: string; body: string }> = [
  {
    title: "It already speaks CQC and CIW",
    body: "Supervisions, spot checks, DBS, mandatory training and care plan reviews are built in and named the way your regulator names them. There is no blank grid to design first.",
  },
  {
    title: "The calendar keeps itself",
    body: "A spreadsheet waits for you to update it. Here you complete the Form and the Check closes, the Evidence is stored and the next due date is set, all in one step.",
  },
  {
    title: "Evidence, not just a tidy list",
    body: "Every completed Form is timestamped, attributed and version stamped. When an inspector asks to see your work you export it rather than assemble it.",
  },
];

export const metadata: Metadata = {
  title: "Be Care Compliant | CQC and CIW compliance software for care providers",
  description:
    "Compliance software for UK care providers. Track every supervision, spot check, DBS and care plan review, see what is overdue at a glance, and export the evidence for CQC, CIW and your local authority. From £49 a month plus VAT.",
};

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Two Registers, kept apart",
    body: "Your staff sit in the People Register, the people you support sit in the Service User Register. Each has its own Checks, due dates and Evidence, so nothing gets mixed up.",
  },
  {
    title: "Reminders that do the chasing",
    body: "A daily digest tells you what is due and what has slipped. Supervisions, reviews and renewals get done on time instead of being found late.",
  },
  {
    title: "Your own Forms when you need them",
    body: "Start from the care template library, then build and version your own Forms with the form builder on Pro.",
  },
];

const SECURITY: Array<{ title: string; body: string }> = [
  {
    title: "Separated in the database",
    body: "One company can never see another's records. That is enforced by the database itself, not by a filter in the software, so a mistake in a screen cannot leak a record.",
  },
  {
    title: "An audit trail nobody can edit",
    body: "Every view, change and download is written to a log that has no way to be altered or deleted, by us or by anyone in your company. That is what makes it evidence.",
  },
  {
    title: "Held in the United Kingdom",
    body: "Your database, your files and your backups sit in a London region. Access inside your company is limited by role, so a carer sees their own record and nothing else.",
  },
  {
    title: "Files that are never public",
    body: "Completed forms, certificates and photographs are stored privately and handed out only through links that expire after five minutes, with every download recorded.",
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
    q: "Do all our carers need a paid account?",
    a: "No. Carers get a free login to see their own Record, however many of them you have. You only pay for the people who manage compliance, so managers, admins and supervisors. Business includes four of those users, Pro includes six, and extra users are £5 each per month.",
  },
  {
    q: "Is this built for CQC and CIW?",
    a: "Yes. Be Care Compliant is built for UK care providers regulated by CQC in England and CIW in Wales, and for local authority contract monitoring including the Provider Quality System return.",
  },
  {
    q: "Do we have to retype everything from our spreadsheets?",
    a: "No. You can bulk import your existing records, including the dates checks were last completed, so day one shows a true picture rather than a blank grid.",
  },
  {
    q: "How does the free trial work?",
    a: "Tell us about your service and we set the 14 day trial up for you and send your logins, usually the same working day. No card is needed and nothing starts billing on its own. We remind you inside the app three days before it ends, and if it does run out your account pauses rather than charging you. Nothing is deleted, and adding a card puts everything back exactly as you left it.",
  },
  {
    q: "How is our data looked after?",
    a: "Service user information is treated as the most sensitive data in the platform. Each company is separated from every other, access is limited by role, every view and change is written to an audit trail, and files are served only over short lived secure links.",
  },
];

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      <main id="content">

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-16 pt-20 text-center sm:pt-28">
        <div className="hero-glow" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl">
          {/* THE POSITION LEADS, THE PROMISE FOLLOWS.
              The old h1 was the specific hook, "see every check that is overdue before your
              inspector does", with the category buried in a small pill above it. That sells a
              feature. The position sells a place in the market, and it is the pattern every
              reference point uses: Stripe leads with financial infrastructure, Linear with a
              purpose built tool, Vanta with automate compliance. The hook is not lost, it now
              opens the supporting line where it still does its work, and the pill carries the
              regulators, which is the trust signal a registered manager scans for. */}
          <span className="reveal is-visible inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
            Built for CQC in England and CIW in Wales
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl sm:leading-[1.05]">
            The operating system for{" "}
            <span className="bg-gradient-to-r from-gold-300 to-gold-400 bg-clip-text text-transparent">
              care compliance.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/75">
            See every check that is overdue before your inspector does. Supervisions, spot checks, DBS, training and
            care plan reviews, for your staff and for the people you support, in one red, amber, green picture, with
            the evidence ready to export the day it is asked for.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/start-trial" className="btn-primary">Start your 14 day free trial</Link>
            <Link href="/pricing" className="btn-outline">See pricing</Link>
          </div>
          <p className="mt-4 text-xs text-white/60">
            From £49 a month plus VAT. No card needed, and we set the trial up for you.
          </p>

          {/* The trust row sits ABOVE the product preview on purpose. It used to sit under a
              tall screenshot, which pushed it clean off the first screen, and these four lines
              are the reason a registered manager keeps reading. Lifted from white/55 to
              white/70 at the same time: small text carrying real weight was sitting on the AA
              contrast threshold. */}
          <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/70">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden className="text-gold-400">&#10003;</span>
                {t}
              </li>
            ))}
          </ul>

          <Reveal className="mx-auto mt-10 max-w-4xl" delay={80}>
            <ProductPreview />
          </Reveal>
        </div>
      </section>

      {/* Built for care, not adapted for it */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">Built for care, not bent into shape</h2>
            <p className="mt-3 text-white/75">
              Three things you get as standard when the software was written for care in the first place, rather
              than adapted to it afterwards.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {EDGES.map((e) => (
              <div key={e.title} className="glass-card p-6">
                <h3 className="text-base font-semibold text-white">{e.title}</h3>
                <p className="mt-2 text-sm text-white/75">{e.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature spotlights (show the product) */}
      <div id="features" className="pt-20">
        <div className="mx-auto max-w-2xl px-4 text-center">
          {/* Confidence, not software. The old heading described the product; this one describes
              the state the buyer is trying to reach. They are not shopping for features, they
              are trying not to be the person who got a Requires Improvement. */}
          <h2 className="text-2xl font-semibold sm:text-3xl">Know where you stand, every day</h2>
          <p className="mt-3 text-white/75">Simple enough to run your service from, thorough enough for an inspector.</p>
        </div>
        <FeatureSpotlights />

        {/* And everything else */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-white/50">And everything else you need</h3>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card glass-card-hover p-6">
                <span aria-hidden className="block h-1 w-10 rounded-full bg-gold-400" />
                <h4 className="mt-4 text-base font-semibold text-white">{f.title}</h4>
                <p className="mt-2 text-sm text-white/75">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Outcomes */}
      <Reveal>
        <Outcomes />
      </Reveal>

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

      {/* Comparison */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Compared with how most services do it today</h2>
          <p className="mt-3 text-white/75">
            A spreadsheet or a wall chart can hold the dates. It cannot chase them, roll them up or prove them.
          </p>
        </div>
        <div className="mt-12">
          <Comparison />
        </div>
      </section>

      {/* Regulator ready reports (local authority quality return example) */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gold-300">Built for CQC and CIW</span>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Regulator ready reports, in one click</h2>
            <p className="mt-4 text-white/75">
              The Provider Quality System return is built in. Your on time completion rates, the starred PQS
              measures and the PQS score are worked out for you and ready to export, so you know where you stand
              before you submit rather than after.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-white/80">
              {[
                "The PQS measures, scored the way the PQS scores them",
                "On time rates graded against the regulatory deadline, not just your calendar",
                "Export to PDF or CSV and hand it straight to your local authority",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 text-gold-400">&#10003;</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <PqsReportPreview />
          </div>
        </div>
      </section>

      {/* Social proof (ready to fill) */}
      <SocialProof />

      {/* SECURITY.
          Every line here is true in the code today and was corroborated against it before it
          was written: separation is a database policy rather than an application filter, the
          audit_log has a select policy and no insert, update or delete policies, the Supabase
          project is eu-west-2 and Vercel is pinned to lhr1, and every evidence file is served
          by a signed URL with a five minute life. Nothing goes on this section that cannot be
          shown. It sits immediately before pricing on purpose: it is the last objection a
          compliance buyer raises before they look at the number. */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-gold-300">Security</span>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
              You are trusting us with the most sensitive records you hold
            </h2>
            <p className="mt-3 text-white/75">
              Staff files and service user records are special category data. Here is exactly how they are handled,
              in terms you can put in front of your own governance meeting.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY.map((item) => (
              <div key={item.title} className="glass-card p-6">
                <span aria-hidden className="block h-1 w-10 rounded-full bg-gold-400" />
                <h3 className="mt-4 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-white/75">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-white/70">
            The detail, including who else is involved and how long we keep things, is in the{" "}
            <Link href="/privacy" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
              privacy notice
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">£49 or £69 a month, per care service</h2>
          <p className="mt-3 text-white/75">
            Two plans, both with a 14 day free trial. Carer logins are free, so you only pay for the people who
            manage compliance. Prices exclude VAT.
          </p>
        </div>
        <div className="mt-12">
          <PricingTable />
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
        <h2 className="text-2xl font-semibold sm:text-3xl">Walk into your next inspection knowing</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/75">
          Start a free trial, bring your existing records in and see the whole compliance picture in one place,
          well before anyone asks to see it.
        </p>
        <div className="mt-8">
          <Link href="/start-trial" className="btn-primary">Start your 14 day free trial</Link>
        </div>
      </section>

      </main>

      <SiteFooter />
    </div>
  );
}
