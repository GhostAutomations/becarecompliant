import type { ReactNode } from "react";
import Reveal from "@/components/marketing/reveal";

/* ---- Small on brand product visuals, static and illustrative ---- */

function LoopVisual() {
  const steps = [
    "You complete a supervision form",
    "The check flips to compliant",
    "Today is stamped as evidence",
    "The next due date is set for you",
  ];
  return (
    <div className="glass-card p-5">
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-xs font-bold text-gold-300">
              {i + 1}
            </span>
            <span className="text-sm text-white/85">{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-gold-400/20 bg-gold-400/[0.06] px-3 py-2 text-xs text-gold-200">
        <span aria-hidden>&#8635;</span> Repeats automatically, every cycle
      </div>
    </div>
  );
}

function RollupVisual() {
  const branches: Array<{ name: string; tone: "green" | "amber" | "red"; note: string }> = [
    { name: "North branch", tone: "green", note: "All compliant" },
    { name: "South branch", tone: "amber", note: "2 due soon" },
    { name: "East branch", tone: "red", note: "1 overdue" },
  ];
  const dot = (t: string) => (t === "green" ? "bg-rag-green" : t === "amber" ? "bg-rag-amber" : "bg-rag-red");
  return (
    <div className="glass-card p-5">
      <div className="space-y-2">
        {branches.map((b) => (
          <div key={b.name} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-white/85">
              <span className={`h-2.5 w-2.5 rounded-full ${dot(b.tone)}`} /> {b.name}
            </span>
            <span className="text-xs text-white/50">{b.note}</span>
          </div>
        ))}
      </div>
      <div className="my-3 text-center text-white/30" aria-hidden>&#8595;</div>
      <div className="flex items-center justify-between rounded-xl border border-gold-400/25 bg-gold-400/[0.06] px-4 py-3">
        <span className="text-sm font-semibold text-white">Company dashboard</span>
        <span className="flex items-center gap-3 text-xs">
          <span className="pill-red text-[11px]"><span className="pill-dot" /> 1 overdue</span>
          <span className="pill-amber text-[11px]"><span className="pill-dot" /> 2 due soon</span>
        </span>
      </div>
    </div>
  );
}

function EvidenceVisual() {
  return (
    <div className="glass-card p-5">
      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Supervision 1</span>
          <span className="pill-green text-[11px]"><span className="pill-dot" /> Stored</span>
        </div>
        <dl className="mt-3 space-y-1.5 text-xs text-white/60">
          <div className="flex justify-between"><dt>Completed by</dt><dd className="text-white/85">Jane Owens</dd></div>
          <div className="flex justify-between"><dt>Completed on</dt><dd className="text-white/85">18 Jul 2026</dd></div>
          <div className="flex justify-between"><dt>Form version</dt><dd className="text-white/85">v2</dd></div>
        </dl>
      </div>
      <div className="mt-4 flex gap-2">
        <span className="flex-1 rounded-lg bg-gold-400 px-3 py-2 text-center text-xs font-semibold text-navy-950">Export PDF</span>
        <span className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-semibold text-white/80">Export CSV</span>
      </div>
    </div>
  );
}

type Spot = { eyebrow: string; title: string; body: string; bullets: string[]; visual: ReactNode };

const SPOTS: Spot[] = [
  {
    eyebrow: "The compliance loop",
    title: "Checks that keep themselves up to date",
    body: "Complete a form once and the rest happens on its own. No spreadsheet to update, no date to remember, no cycle missed.",
    bullets: ["The check completes and the date is stamped", "The completed form is stored as evidence", "The next due date is calculated for you"],
    visual: <LoopVisual />,
  },
  {
    eyebrow: "One clear picture",
    title: "Red, amber, green, from one carer to the whole company",
    body: "Status rolls up from every check to the record, the branch and the company, so you always know if you are inspection ready.",
    bullets: ["Spot the exact overdue item in two clicks", "See every branch at a glance", "No more hunting through tabs and files"],
    visual: <RollupVisual />,
  },
  {
    eyebrow: "Ready for the visit",
    title: "Evidence an inspector can trust, one click away",
    body: "Every completed form is timestamped, attributed and versioned. When you are asked to show your work, it is already done.",
    bullets: ["Author, date and form version on every record", "Export to PDF or CSV in seconds", "A full audit trail behind it"],
    visual: <EvidenceVisual />,
  },
];

export default function FeatureSpotlights() {
  return (
    <section className="mx-auto max-w-6xl space-y-20 px-4 py-20">
      {SPOTS.map((s, i) => {
        const reversed = i % 2 === 1;
        return (
          <Reveal key={s.title}>
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className={reversed ? "lg:order-2" : ""}>
                <span className="text-xs font-semibold uppercase tracking-wide text-gold-300">{s.eyebrow}</span>
                <h3 className="mt-3 text-2xl font-semibold sm:text-3xl">{s.title}</h3>
                <p className="mt-4 text-white/75">{s.body}</p>
                <ul className="mt-6 space-y-2.5 text-sm text-white/80">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5">
                      <span aria-hidden className="mt-0.5 text-gold-400">&#10003;</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={reversed ? "lg:order-1" : ""}>{s.visual}</div>
            </div>
          </Reveal>
        );
      })}
    </section>
  );
}
