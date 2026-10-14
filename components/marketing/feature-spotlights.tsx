import type { ReactNode } from "react";
import Reveal from "@/components/marketing/reveal";
import LoopStory from "@/components/marketing/scenes/loop-story";
import DashboardScene from "@/components/marketing/scenes/dashboard-scene";
import EvidenceStory from "@/components/marketing/scenes/evidence-story";
import CloudStory from "@/components/marketing/scenes/cloud-story";

/* ---- The scenes: built from the app's own components and styles, with invented names. Three of
   them play a short story once as they scroll into view (Phil, 2026-10-14); the dashboard one is
   still. The old drawings (a numbered list, a North/South/East branch picture no screen draws,
   and an evidence card) are gone. ---- */
type Spot = { eyebrow: string; title: string; body: string; bullets: string[]; visual: ReactNode };

const SPOTS: Spot[] = [
  {
    eyebrow: "The compliance loop",
    title: "Checks that keep themselves up to date",
    body: "Complete a form once and the rest happens on its own. No spreadsheet to update, no date to remember, no cycle missed.",
    bullets: [
      "The check completes and the date is stamped",
      "The completed form is stored as evidence",
      "The next due date is calculated for you",
      "The dashboard and branch readiness update with it",
    ],
    visual: <LoopStory />,
  },
  {
    eyebrow: "One clear picture",
    title: "Red, amber, green, from one carer to the whole company",
    body: "Status rolls up from every check to the record, the branch and the company, so you always know where you stand.",
    bullets: [
      "Overdue, then due in 7, 14 and 30 days, on one line",
      "Hover a figure to see exactly what is behind it",
      "Readiness for every branch, theme by theme, for CQC or CIW",
    ],
    visual: <DashboardScene />,
  },
  {
    eyebrow: "Ready for the visit",
    title: "Evidence an inspector can trust, one click away",
    body: "Every completed form is timestamped, attributed and versioned. When you are asked to show your work, it is already done.",
    bullets: [
      "Author, date and form version on every record",
      "Download any completed form as a PDF in seconds",
      "Every view, change and download written to the audit trail",
    ],
    visual: <EvidenceStory />,
  },
  {
    eyebrow: "Your own copy",
    title: "Every completed form, copied into your Microsoft 365",
    body: "Connect OneDrive or a SharePoint site and every completed form, certificate, letter and policy is copied into a folder for each person and service user. Be Care Compliant stays the record, and your drive keeps a copy.",
    bullets: [
      "A folder for each branch, person and service user",
      "Copy everything you already have in one go, with no duplicates",
      "We never see your Microsoft password",
    ],
    visual: <CloudStory />,
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
              <div className={`min-w-0 ${reversed ? "lg:order-2" : ""}`}>
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
              <div className={`min-w-0 ${reversed ? "lg:order-1" : ""}`}>{s.visual}</div>
            </div>
          </Reveal>
        );
      })}
    </section>
  );
}
