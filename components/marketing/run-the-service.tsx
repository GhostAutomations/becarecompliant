import Reveal from "@/components/marketing/reveal";
import RtwStory from "@/components/marketing/scenes/rtw-story";

/**
 * Be Care Compliant: "Everything your service runs on" (Phil, 2026-10-14, popups: all four
 * groups, in place of the small "And everything else you need" row).
 *
 * EVERY LINE IS IN THE PRODUCT TODAY, checked against the code before it was written, and a line
 * gated to Pro says so (lib/billing/tier.ts PRO_FEATURES: sms_reminders, complaints, invoicing,
 * planner, on_call, form_builder). If a line stops being true, it comes off.
 */

type Line = { text: string; pro?: boolean };
type Group = { title: string; body: string; lines: Line[] };

const STAFF: Group = {
  title: "Your staff, looked after",
  body: "Absence, Return to Work, holidays and training, kept on the same record as their checks.",
  lines: [
    { text: "Absence recorded with its stage worked out for you, by occasions or the Bradford Factor" },
    { text: "Meeting invitations and outcome letters ready to send, with the outcome drafted for you to check" },
    { text: "Return to Work questions sent by text and answered in the staff portal", pro: true },
    { text: "Holiday requests approved in one click, with a calendar for each branch" },
    { text: "A training matrix with expiry dates and Social Care Wales registration" },
  ],
};

const GROUPS: Group[] = [
  {
    title: "Cases and inspections",
    body: "The things that go wrong, the people who raise them, and the visit itself.",
    lines: [
      { text: "Incidents reported from the staff portal, then investigated and closed, with notifiable, safeguarding and RIDDOR on the case" },
      { text: "Complaints with their response deadlines, and letters drafted for you to check", pro: true },
      { text: "Whistleblowing concerns seen only by the Company Admin and the Responsible Individual" },
      { text: "Inspection Readiness for each branch, theme by theme, with an inspection pack to download" },
      { text: "Regulation 73 and Regulation 80 reports for CIW services" },
    ],
  },
  {
    title: "Policies, briefings and forms",
    body: "What your team is expected to know, and the proof they know it.",
    lines: [
      { text: "Policies written or improved by AI from a cited guidance library, for you to check" },
      { text: "The policies your regulator expects, each with an owner and a review date" },
      { text: "Briefings that send a policy to read and sign, a form to complete or a memo, and show who has done it" },
      { text: "Signatures filed as Evidence on each person's record" },
      { text: "Your own Forms, built and versioned in the form builder", pro: true },
    ],
  },
  {
    title: "Running the service",
    body: "The day to day around the compliance, in the same place.",
    lines: [
      { text: "An On Call rota and handover log, with urgent follow ups on the dashboard", pro: true },
      { text: "A Planner and Whiteboard to book checks to the right person, with a calendar feed", pro: true },
      { text: "Private client invoices from the care plan, with recurring drafts", pro: true },
      { text: "A daily digest of what is due and what has slipped" },
      { text: "A copy of every completed form in your own OneDrive or SharePoint" },
    ],
  },
];

function ProChip() {
  return (
    <span className="ml-1.5 inline-flex translate-y-[-1px] items-center rounded-full border border-gold-400/40 px-1.5 py-px text-[10px] font-semibold text-gold-300">
      Pro
    </span>
  );
}

function GroupCard({ g }: { g: Group }) {
  return (
    <div className="glass-card h-full p-6">
      <span aria-hidden className="block h-1 w-10 rounded-full bg-gold-400" />
      <h4 className="mt-4 text-base font-semibold text-white">{g.title}</h4>
      <p className="mt-2 text-sm text-white/75">{g.body}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-white/80">
        {g.lines.map((l) => (
          <li key={l.text} className="flex gap-2.5">
            <span aria-hidden className="mt-0.5 text-gold-400">&#10003;</span>
            <span>
              {l.text}
              {l.pro ? <ProChip /> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RunTheService() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20">
      <div className="mx-auto max-w-2xl text-center">
        <h3 className="text-2xl font-semibold sm:text-3xl">Everything your service runs on</h3>
        <p className="mt-3 text-white/75">
          Compliance is the centre of it. Around it sits the rest of running a care service, in the same place and
          on the same records.
        </p>
      </div>

      <Reveal className="mt-12">
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <RtwStory />
          </div>
          <div className="min-w-0">
            <GroupCard g={STAFF} />
          </div>
        </div>
      </Reveal>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <Reveal key={g.title}>
            <GroupCard g={g} />
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-white/60">
        <span className="mr-1 inline-flex items-center rounded-full border border-gold-400/40 px-1.5 py-px text-[10px] font-semibold text-gold-300">
          Pro
        </span>
        marks what comes with the Pro plan. Everything else is on both plans.
      </p>
    </section>
  );
}
