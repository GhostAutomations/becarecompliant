import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import PricingTiers from "@/components/marketing/pricing-tiers";
import PricingTable from "@/components/marketing/pricing-table";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import {
  OFFER_HEADLINE,
  ONBOARDING_FEE,
  ONBOARDING_FEE_FROM_TEXT,
  ONBOARDING_OFFER_END_TEXT,
  onboardingOfferActive,
} from "@/lib/marketing/offer";

export const metadata: Metadata = {
  // The root layout template already appends the brand ("%s · Be Care Compliant").
  title: "Pricing",
  description:
    "Pricing for Be Care Compliant. Business £79 a month and Pro £129 a month, both plus VAT, per care service, or pay yearly and get two months free. Carer logins are free.",
};

/* The page reads the date on every request, so the free onboarding offer comes down by itself
   on 1 January 2027 instead of relying on somebody remembering (lib/marketing/offer.ts). */
export const dynamic = "force-dynamic";

const ONBOARDING_STEPS: Array<{ title: string; body: string }> = [
  { title: "Your records moved across", body: "We import your staff and service users from your spreadsheets or current system." },
  { title: "Your forms built", body: "Send us your supervision, spot check and care review forms and we build them for you." },
  { title: "Your checks set up", body: "Every check scheduled from its last completed date, so your status is right on day one." },
  { title: "Your team shown round", body: "A walkthrough for your managers before your staff are invited." },
];

const EXTRAS: Array<{ name: string; body: string; cost: string; unit: string }> = [
  { name: "Extra user", body: "Someone who signs in to run compliance. Carer logins are free.", cost: "£5", unit: "per month" },
  { name: "Extra branch", body: "Its own registers, its own status and its own reports.", cost: "£25", unit: "per month" },
  { name: "AI credits", body: "100 more credits. Unused credits carry over until used.", cost: "£10", unit: "one off" },
  { name: "Text messages", body: "250 more texts for reminders and Return to Work questions.", cost: "£20", unit: "one off" },
];

/** The things a registered manager asks before they will read a price table. */
function explainers(offerActive: boolean): Array<{ term: string; body: string }> {
  return [
    {
      term: "What a plan covers",
      body: "One care service on one plan. Business includes one branch, Pro includes two, and extra branches are £25 each per month.",
    },
    {
      term: "What counts as a user",
      body: "A user is someone who signs in to run compliance, so a registered manager, an admin or a supervisor. Business includes four, Pro includes six, and extra users are £5 each per month.",
    },
    {
      term: "Carer logins are free",
      body: "Your carers get their own free login to see their Record, however many carers you have. A 60 carer service does not pay for 60 users.",
    },
    {
      term: "Monthly or yearly",
      body: "Pay monthly and cancel any time, or pay yearly in advance and get two months free: £790 a year for Business, £1,290 for Pro.",
    },
    offerActive
      ? {
          term: "Free onboarding until 31 December",
          body: `Join by ${ONBOARDING_OFFER_END_TEXT}, with your agreement signed and your first payment made, and onboarding is free on either plan. From ${ONBOARDING_FEE_FROM_TEXT} it is ${ONBOARDING_FEE} plus VAT, and free on yearly plans.`,
        }
      : {
          term: "Onboarding",
          body: `A one off ${ONBOARDING_FEE} plus VAT: we import your records, build your forms, set up your checks and show your managers round. It is free on yearly plans.`,
        },
    {
      term: "If you ever leave",
      body: "Your records are yours. You can export them at any time while you are with us, as PDFs or CSVs. If a subscription ends your account pauses rather than being deleted, and we will export everything for you or delete it, whichever you ask for.",
    },
    {
      term: "VAT and the trial",
      body: "All prices exclude VAT. Both plans start with a 14 day free trial and no card is needed to begin. If a trial runs out your account pauses rather than charging you, nothing is deleted, and adding a card puts it all back.",
    },
  ];
}

export default async function PricingPage() {
  const user = await getSessionUser();
  const offerActive = onboardingOfferActive(formatCivilDate(todayInLondon()));

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      <main id="content">

      <section className="mx-auto max-w-6xl px-4 pb-4 pt-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-300">Pricing</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Simple pricing for care compliance</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/75">
          One monthly price for your whole compliance calendar, per care service. Carer logins are always free, and
          both plans start with a 14 day free trial.
        </p>

        {offerActive ? (
          <div className="mx-auto mt-8 grid max-w-3xl items-center gap-4 rounded-2xl border border-gold-400/45 bg-gradient-to-br from-gold-400/20 to-gold-400/5 p-5 text-left sm:grid-cols-[auto_1fr_auto]">
            <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400 text-xl font-bold text-navy-950 sm:mx-0">
              &#10003;
            </span>
            <div className="text-center sm:text-left">
              <h2 className="text-lg font-semibold text-white">{OFFER_HEADLINE}</h2>
              <p className="mt-1 text-sm text-white/80">
                We will build your forms and import your records for free, saving you {ONBOARDING_FEE}.
              </p>
              <p className="mt-1 text-xs text-white/55">
                Join by {ONBOARDING_OFFER_END_TEXT}: agreement signed and first payment made. Onboarding is {ONBOARDING_FEE} plus
                VAT from {ONBOARDING_FEE_FROM_TEXT}.
              </p>
            </div>
            <Link href="/start-trial" className="btn-primary justify-center text-sm">Request a trial</Link>
          </div>
        ) : null}
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 pt-8">
        <PricingTiers offerActive={offerActive} />
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="text-2xl font-semibold">{offerActive ? "What free onboarding includes" : "What onboarding includes"}</h2>
          <p className="mt-2 text-white/60">
            {offerActive
              ? `Usually ${ONBOARDING_FEE}. Free for every care company that joins by ${ONBOARDING_OFFER_END_TEXT}.`
              : `A one off ${ONBOARDING_FEE} plus VAT, free on yearly plans.`}
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s.title} className="glass-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400/15 text-sm font-bold text-gold-300">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-white/65">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="text-2xl font-semibold">Extras, only when you need them</h2>
          <p className="mt-2 text-white/60">Nothing is added without you choosing it. All prices plus VAT.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {EXTRAS.map((e) => (
              <div key={e.name} className="glass-card flex items-start justify-between gap-4 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">{e.name}</h3>
                  <p className="mt-1 text-sm text-white/65">{e.body}</p>
                </div>
                <div className="whitespace-nowrap text-right">
                  <div className="font-bold text-white">{e.cost}</div>
                  <div className="text-xs text-white/50">{e.unit}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="text-2xl font-semibold">Compare the plans</h2>
          <p className="mb-6 mt-2 text-white/60">Both plans include every core compliance feature.</p>
          <PricingTable />
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="text-center text-2xl font-semibold">How the pricing works</h2>
          <dl className="mt-10 grid gap-5 sm:grid-cols-2">
            {explainers(offerActive).map((e) => (
              <div key={e.term} className="glass-card p-6">
                <dt className="text-base font-semibold text-white">{e.term}</dt>
                <dd className="mt-2 text-sm text-white/75">{e.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold">Not sure which plan?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">
            Business covers the compliance you cannot afford to miss. Pro adds Complaints, every report including
            the PQS return, SMS reminders and the form builder. Request a trial on either and tell us in the form if
            you run several services or a larger group.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/start-trial" className="btn-primary">Request a trial</Link>
          </div>
          <p className="mt-6 text-sm text-white/60">
            Rather ask a question first? Email{" "}
            <a href="mailto:hello@becarecompliant.com" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
              hello@becarecompliant.com
            </a>
          </p>
        </div>
      </section>

      </main>

      <SiteFooter />
    </div>
  );
}
