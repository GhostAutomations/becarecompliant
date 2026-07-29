import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import PricingTable from "@/components/marketing/pricing-table";

export const metadata: Metadata = {
  title: "Pricing | Be Care Compliant",
  description:
    "Pricing for Be Care Compliant. Business £49 a month and Pro £69 a month, both plus VAT, per care service, both with a 14 day free trial. Carer logins are free.",
};

/** The four things a registered manager asks before they will read a price table. */
const EXPLAINERS: Array<{ term: string; body: string }> = [
  {
    term: "What a plan covers",
    body: "One care service on one plan. Business includes one branch, Pro includes two, and extra branches are £7.50 each per month.",
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
    term: "VAT and the trial",
    body: "All prices exclude VAT. Both plans start with a 14 day free trial and no card is needed to begin. If a trial runs out your account pauses rather than charging you, nothing is deleted, and adding a card puts it all back. You can change plan as you grow.",
  },
];

export default async function PricingPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      <section className="mx-auto max-w-6xl px-4 pb-8 pt-20 text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">£49 or £69 a month, per care service</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/75">
          Two plans, both plus VAT, both with a 14 day free trial. Carer logins are free, so you pay for the
          handful of people who manage compliance, not for everyone on your rota.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16">
        <PricingTable />
      </section>

      {/* What you are actually buying */}
      <section className="border-t border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="text-center text-2xl font-semibold">How the pricing works</h2>
          <dl className="mt-10 grid gap-5 sm:grid-cols-2">
            {EXPLAINERS.map((e) => (
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
            the PQS return, SMS reminders and the form builder. Start a trial on either and tell us in the form if
            you run several services or a larger group.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/start-trial" className="btn-primary">Start your 14 day free trial</Link>
          </div>
          <p className="mt-6 text-sm text-white/60">
            Rather ask a question first? Email{" "}
            <a href="mailto:hello@becarecompliant.com" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
              hello@becarecompliant.com
            </a>
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
