import Story from "./story";
import { d } from "./timing";
import { s } from "./class-names";
import { sceneDates } from "@/lib/marketing/scene-dates";

/**
 * Be Care Compliant: Evidence for an inspector (Phil, 2026-10-14, popup).
 *
 * The completed supervision as the Evidence page shows it (app/(app)/evidence/[id]/page.tsx):
 * the form's name, "Completed evidence, stored unchanged as your inspection record.", the four
 * facts (Completed by, Completed at, Form version, Branch), the answers, and Download PDF. Then
 * the audit trail fills in, line by line, with the entries the app really writes, in the
 * columns the Audit trail report really has (components/reports/audit-log-view.tsx):
 * evidence.created "Completed Supervision (version 3)", evidence.viewed "Viewed evidence on
 * screen", evidence.downloaded "Downloaded evidence PDF".
 */

export default function EvidenceStory() {
  const t = sceneDates();
  const AUDIT: Array<{ when: string; action: string; detail: string; at: number }> = [
    { when: `${t.long(0)} at 10:42`, action: "evidence.created", detail: "Completed Supervision (version 3)", at: 1900 },
    { when: `${t.long(0)} at 10:43`, action: "evidence.viewed", detail: "Viewed evidence on screen", at: 2500 },
    { when: `${t.long(0)} at 10:43`, action: "evidence.downloaded", detail: "Downloaded evidence PDF", at: 3700 },
  ];
  return (
    <Story
      durationMs={4400}
      label="A short animation: a completed supervision shown as stored evidence, with who completed it, when and on which form version, then downloaded as a PDF, with each step written to the audit trail."
      className={s.frame}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className={s.appear} style={d(200)}>
          <p className="text-xs text-white/55">&larr; Back to person</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="page-title">Supervision</p>
              <p className="page-subtitle">Completed evidence, stored unchanged as your inspection record.</p>
            </div>
            <span className={`${s.press} inline-flex`} style={d(3300)}>
              <span className="btn-primary px-4 py-2 text-sm">Download PDF</span>
            </span>
          </div>

          <div className="glass-card mt-3 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {[
              ["Completed by", "Rhian Bowen"],
              ["Completed at", `${t.slash(0)}, 10:42`],
              ["Form version", "Version 3"],
              ["Branch", "Riverside"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[11px] uppercase text-white/55">{k}</p>
                <p className="text-sm text-white/85">{v}</p>
              </div>
            ))}
          </div>

          <div className="glass-card mt-3 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">The supervision</p>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-white/55">Member of staff</dt>
                <dd className="text-sm text-white/90">Ffion Rees</dd>
              </div>
              <div className="border-t border-white/5 pt-2">
                <dt className="text-xs text-white/55">Date of supervision</dt>
                <dd className="text-sm text-white/90">{t.long(0)}</dd>
              </div>
              <div className="border-t border-white/5 pt-2">
                <dt className="text-xs text-white/55">Declaration</dt>
                <dd className="text-sm text-white/90">Signature captured</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <p className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Audit trail
          </p>
          <div className="divide-y divide-white/5">
            {AUDIT.map((a) => (
              <div key={a.action} className={`${s.appear} grid gap-x-3 px-4 py-2 text-[11px] sm:grid-cols-[10rem_8.5rem_1fr]`} style={d(a.at)}>
                <span className="text-white/80">{a.when}</span>
                <span className="text-white/70">{a.action}</span>
                <span className="text-white/70">{a.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Story>
  );
}
