import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";

/**
 * Privacy notice.
 *
 * WHY IT EXISTS. Until now the site collected a name, an email and a phone number from a
 * stranger on /start-trial, told them "we use these details only to set your trial up", and
 * gave them nothing to check that promise against. For any product that is a gap. For one
 * whose whole pitch is that it handles special category health data properly, and which
 * sells to people whose job is compliance, it was the weakest signal on the site.
 *
 * WRITTEN FROM WHAT THE CODE ACTUALLY DOES, not from a template: the London Supabase
 * project, the private evidence bucket with five minute signed URLs, per company separation
 * in RLS, the audit log, the eight year retention rule, and the real list of suppliers the
 * platform calls. If any of those change, this page changes with them.
 *
 * NOT LEGAL ADVICE and not yet checked by a solicitor. Two things must be settled before
 * launch: the controller identity (the company is not incorporated yet, so there is no
 * registered name, number or address to name here), and confirmation of the AI supplier
 * position, since that is the one transfer that leaves the UK and Europe.
 */

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Be Care Compliant handles personal information: what the website collects, what sits inside the platform, who we use, where it is kept and how long for.",
};

const UPDATED = "29 July 2026";

type Section = { heading: string; body: string[] };

const SECTIONS: Section[] = [
  {
    heading: "The two different sets of information",
    body: [
      "There are two very different kinds of personal information around Be Care Compliant, and the difference matters, because we do not hold the same role for each.",
      "The first is information about you as a visitor to this website, for example when you ask for a trial. For that information we decide what happens to it, so we are the data controller.",
      "The second is the information inside the platform, meaning your staff records and the records of the people your service supports. That belongs to your care company. Your company decides what goes in it and what it is used for, so your company is the controller and we are only the processor acting on your instructions. We do not use it for anything of our own, and we never sell it.",
    ],
  },
  {
    heading: "What this website collects",
    body: [
      "If you ask for a trial we collect your company name, your name, your email address and, if you choose to give them, your phone number, the size of your team, the plan you are interested in and anything you tell us in the message box.",
      "We use it to reply to you, to set your trial up and to talk to you about it. We do not sell it and we do not pass it to anyone for their own marketing.",
      "We keep a trial request for as long as we are talking to you about it, and for up to two years afterwards so we know who we have already spoken to. Ask us and we will delete it sooner.",
      "The website sets no advertising cookies and no analytics cookies. Once you sign in, the application uses cookies that are strictly necessary to keep you signed in and to keep your session secure.",
    ],
  },
  {
    heading: "What sits inside the platform",
    body: [
      "The platform holds records about your staff, such as supervisions, spot checks, training, DBS and right to work checks, absence and holiday, and records about the people you support, such as care plan reviews, risk assessments and medication audits. Some of that is health information, which the law treats as a special category and which we treat as the most sensitive data we hold.",
      "Every company's data is separated from every other company's at the database level rather than by a filter in the application, so one company cannot see another's records even if something goes wrong in the interface.",
      "Access inside a company is limited by role. A carer sees their own record. A supervisor sees their caseload. Views and changes are written to an audit trail that cannot be edited.",
      "Files and completed forms are stored privately. They are never public, and they are handed out only through links that expire after five minutes, with each download recorded.",
    ],
  },
  {
    heading: "Where it is kept",
    body: [
      "The database, the files and the backups are held in the United Kingdom, in a London region.",
      "One exception is worth stating plainly. Where you choose to use an AI feature, the text of that request is sent to our AI supplier for processing and comes straight back. That supplier operates outside the United Kingdom and Europe, so that particular transfer relies on the standard contractual safeguards. AI features are optional and metered, and nothing is sent to them unless someone in your company asks for it.",
    ],
  },
  {
    heading: "Who else is involved",
    body: [
      "We use a small number of suppliers to run the service, and each of them only sees what they need to do their part.",
      "Hosting and the application itself run on Vercel. The database, the file storage and authentication are provided by Supabase, in a London region. Email is sent through Resend. Text messages, where your plan includes them, are sent through Twilio. Payments are handled by Stripe, which means card details never reach our servers. AI features are processed by our AI supplier as described above.",
      "We do not add new suppliers who touch your data without telling the companies who use the platform.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      // Careful with this sentence. The first draft said evidence "is anonymised" after eight
      // years, which the code does not do: lib/evidence/retention.ts holds the rule and the
      // anonymise function, but nothing calls them, retention_until is never populated and
      // there is no retention cron. A privacy notice that promises a process nobody runs is
      // worse than one that stays quiet, so this now says only what is true today.
      "Compliance evidence is kept for at least eight years from the end of a person's care, which reflects what a care provider is expected to be able to produce for a regulator. After that it can be anonymised, and we will anonymise it or delete it if you ask us to.",
      "If your company stops using Be Care Compliant, your records are not deleted the moment a subscription ends. Tell us and we will export them for you or delete them, whichever you ask for.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "You can ask what we hold about you, ask for it to be corrected, ask for it to be deleted, ask us to limit what we do with it, or object to it.",
      "If your request is about records inside the platform, the right person to ask first is the care company that holds them, because they are the controller. We will always help them answer you.",
      "If you are not happy with how we have handled something, you can complain to the Information Commissioner's Office at ico.org.uk.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Email hello@becarecompliant.com and a person will read it.",
    ],
  },
];

export default async function PrivacyPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />

      <main id="content">

      <section className="mx-auto max-w-3xl px-4 pb-20 pt-16">
        <h1 className="text-3xl font-bold sm:text-4xl">Privacy</h1>
        <p className="mt-4 text-white/75">
          How Be Care Compliant handles personal information. Written in plain English,
          because the people who read it are the people who have to answer for it.
        </p>
        <p className="mt-2 text-xs text-white/50">Last updated {UPDATED}</p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <div key={s.heading} className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-white/75">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-white/60">
          Questions about any of this?{" "}
          <a
            href="mailto:hello@becarecompliant.com"
            className="text-gold-300 underline underline-offset-4 hover:text-gold-400"
          >
            hello@becarecompliant.com
          </a>
          , or{" "}
          <Link href="/start-trial" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
            ask for a trial
          </Link>
          .
        </p>
      </section>

      </main>

      <SiteFooter />
    </div>
  );
}
