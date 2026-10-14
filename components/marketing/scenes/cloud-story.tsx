import Story from "./story";
import { d } from "./timing";
import { s } from "./class-names";

/**
 * Be Care Compliant: the copy lands in OneDrive or SharePoint (Phil, 2026-10-14, popup).
 *
 * What the cloud drive copy really does (app/(app)/settings/cloud/page.tsx, lib/cloud): every
 * completed form is copied into the company's own Microsoft 365, into
 * Be Care Compliant > People > [branch] > [person] > [the check's folder], named with the
 * person's initials, the form and the London date ("FR Supervision 2026-10-14.pdf",
 * lib/cloud/names.ts recordFileName). Be Care Compliant stays the record; the drive gets a copy.
 *
 * Drawn as a plain folder listing in our own style, never Microsoft's: no logos, no imitation of
 * their screens.
 */

const PATH = ["Be Care Compliant", "People", "Riverside", "Ffion Rees"];
/* Some of Ffion's folders, beside the one the copy lands in (lib/cloud/names.ts: the fixed
   folders every person gets, plus one per check). */
const FOLDERS = ["Absence", "DBS", "Supervision 1"];

function FileIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-300">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-gold-300/80">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

export default function CloudStory() {
  return (
    <Story
      durationMs={4000}
      label="A short animation: a completed supervision is saved in Be Care Compliant and a PDF copy appears in the person's folder in the company's own OneDrive or SharePoint."
      className={s.frame}
    >
      <div className="space-y-3 p-4 sm:p-5">
        {/* Where it starts: the evidence, stored. */}
        <div className="glass-card flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Supervision, Ffion Rees</p>
            <p className="text-[11px] text-white/55">Completed 14/10/2026, 10:42, Version 3</p>
          </div>
          <span className="pill-green shrink-0">
            <span className="pill-dot" /> Evidence stored
          </span>
        </div>

        <div className="flex justify-center" aria-hidden>
          <span className={`${s.appear} text-xs font-semibold text-gold-300`} style={d(600)}>
            &darr; Copied to your Microsoft 365
          </span>
        </div>

        {/* Where it lands: a folder in the company's own drive. */}
        <div className="glass-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Copies go to OneDrive</p>
            <span className="text-[11px] text-white/55">Your drive, your copy</span>
          </div>
          <p className="flex flex-wrap items-center gap-1 px-4 pt-3 text-[11px] text-white/70">
            {PATH.map((p, i) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 ? <span className="text-white/40">&rsaquo;</span> : null}
                <span className={i === PATH.length - 1 ? "font-semibold text-white" : ""}>{p}</span>
              </span>
            ))}
          </p>
          <div className="mt-2 px-2 pb-2 text-sm">
            {FOLDERS.map((f) => (
              <div key={f} className="flex items-center gap-3 px-2 py-1.5 text-white/75">
                <FolderIcon />
                <span>{f}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 px-2 py-1.5 font-semibold text-white">
              <FolderIcon />
              <span>Supervision 2</span>
            </div>
            <div className={`${s.appear} relative ml-6 flex items-center gap-3 rounded-lg px-2 py-2`} style={d(1400)}>
              <FileIcon />
              <span className="min-w-0 flex-1 truncate font-semibold text-white">FR Supervision 2026-10-14.pdf</span>
              <span className="shrink-0 text-[11px] text-white/55">Just now</span>
              <span className={s.glow} style={d(1500)} />
            </div>
          </div>
        </div>
      </div>
    </Story>
  );
}
