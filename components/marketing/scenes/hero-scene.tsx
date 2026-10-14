import { s } from "./class-names";

/**
 * Be Care Compliant: the hero scene, the People register as the app draws it today (Phil,
 * 2026-10-14: "the matrix on the homepage looks like our actual matrix").
 *
 * Built from the app's own classes (.matrix, .rag-cell, .pill-*, .done-on-time, .done-late), so it
 * looks exactly like the real register and changes with it. The columns are the real ones, in the
 * real order, with the real labels (components/people/register-matrix.tsx); the app lets a
 * company hide columns, and this shows a sensible subset. The cell rules are the app's: a due
 * date carries the RAG pill while it is outstanding and turns plain once done; a done date is
 * green on time and amber late; a missing date is a grey dash.
 *
 * Calm on purpose: nothing here moves. Invented names and dates only, aria-hidden, with a short
 * visually hidden description.
 */

type Pill = { text: string; tone: "green" | "amber" | "red" | "none" };
type Row = {
  name: string;
  status: { text: string; tone: "green" | "amber" };
  job: string;
  edbs: Pill;
  spot: Pill;
  sup1Due: Pill | string;
  sup1Done: { text: string; late?: boolean } | null;
  sup2Due: Pill | string;
  sup2Done: { text: string; late?: boolean } | null;
};

const none: Pill = { text: "—", tone: "none" };

const ROWS: Row[] = [
  {
    name: "Ffion Rees",
    status: { text: "Active", tone: "green" },
    job: "Care Assistant",
    edbs: { text: "03 Mar 28", tone: "green" },
    spot: { text: "21 Oct 26", tone: "amber" },
    sup1Due: "12 Jun 26",
    sup1Done: { text: "10 Jun 26" },
    sup2Due: { text: "12 Sep 26", tone: "red" },
    sup2Done: null,
  },
  {
    name: "Owain Pritchard",
    status: { text: "Active", tone: "green" },
    job: "Senior Care Assistant",
    edbs: { text: "19 Aug 27", tone: "green" },
    spot: { text: "02 Dec 26", tone: "green" },
    sup1Due: "05 May 26",
    sup1Done: { text: "02 May 26" },
    sup2Due: "05 Aug 26",
    sup2Done: { text: "11 Aug 26", late: true },
  },
  {
    name: "Hannah Clarke",
    status: { text: "Active", tone: "green" },
    job: "Care Assistant",
    edbs: { text: "28 Nov 26", tone: "amber" },
    spot: { text: "16 Dec 26", tone: "green" },
    sup1Due: "09 Sep 26",
    sup1Done: { text: "04 Sep 26" },
    sup2Due: { text: "09 Dec 26", tone: "green" },
    sup2Done: null,
  },
  {
    name: "Priya Shah",
    status: { text: "Active", tone: "green" },
    job: "Care Assistant",
    edbs: { text: "11 Jan 28", tone: "green" },
    spot: { text: "05 Jan 27", tone: "green" },
    sup1Due: { text: "24 Oct 26", tone: "amber" },
    sup1Done: null,
    sup2Due: none,
    sup2Done: null,
  },
  {
    name: "Megan Lloyd",
    status: { text: "Mat Leave", tone: "amber" },
    job: "Care Assistant",
    edbs: { text: "07 Jul 27", tone: "green" },
    spot: { text: "18 Nov 26", tone: "green" },
    sup1Due: "20 Apr 26",
    sup1Done: { text: "17 Apr 26" },
    sup2Due: "20 Jul 26",
    sup2Done: { text: "15 Jul 26" },
  },
  {
    name: "Rhian Bowen",
    status: { text: "Active", tone: "green" },
    job: "Registered Manager",
    edbs: { text: "22 Feb 28", tone: "green" },
    spot: { text: "30 Jan 27", tone: "green" },
    sup1Due: "14 Jul 26",
    sup1Done: { text: "08 Jul 26" },
    sup2Due: { text: "14 Jan 27", tone: "green" },
    sup2Done: null,
  },
];

function Rag({ p }: { p: Pill }) {
  return <span className={`rag-cell rag-cell-${p.tone}`}>{p.text}</span>;
}

function Due({ v }: { v: Pill | string }) {
  return typeof v === "string" ? <span>{v}</span> : <Rag p={v} />;
}

function Done({ v }: { v: { text: string; late?: boolean } | null }) {
  if (!v) return <span>—</span>;
  return <span className={v.late ? "done-late" : "done-on-time"}>{v.text}</span>;
}

/* On a phone the frame is narrow: the name and Supervision 2 (where the red is) tell the story,
   and the fade at the edge says there is more. Wider screens add columns in the app's order. */
const wide = "hidden md:table-cell";

export default function HeroScene() {
  return (
    <div className={s.frame}>
      <p className="sr-only">
        A view of the People register in Be Care Compliant: each member of staff with their checks, due dates in
        red, amber or green, and the dates each supervision was done.
      </p>
      <div aria-hidden className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="page-title">Compliance</p>
            <p className="page-subtitle">Every active person with their compliance checks, due dates and RAG status.</p>
          </div>
          <span className="btn-primary hidden px-4 py-2 text-sm sm:inline-flex">Add person</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-white">Branches</span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-white">Riverside</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-white">View</span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-white">Matrix</span>
          </span>
          <span className="hidden rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-white/55 sm:inline">
            Search people
          </span>
        </div>
        <p className="mt-2 text-right text-[11px] text-white/55">6 records</p>

        <div className={`mt-1 ${s.matrixClip} ${s.compact}`}>
          <table className="matrix">
            <thead>
              <tr>
                <th className="col-carer">Carer</th>
                <th className="hidden sm:table-cell">Status</th>
                <th className="hidden 2xl:table-cell">Job Title</th>
                <th className={wide}>Enhanced DBS</th>
                <th className="hidden xl:table-cell">Spot Check Due</th>
                <th className="hidden sm:table-cell">Supervision 1 Due</th>
                <th className="hidden sm:table-cell">Supervision 1 Done</th>
                <th>Supervision 2 Due</th>
                <th>Supervision 2 Done</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <td className="col-carer">{r.name}</td>
                  <td className="hidden sm:table-cell">
                    <span className={`pill-${r.status.tone}`}>{r.status.text}</span>
                  </td>
                  <td className="hidden 2xl:table-cell">{r.job}</td>
                  <td className={wide}>
                    <Rag p={r.edbs} />
                  </td>
                  <td className="hidden xl:table-cell">
                    <Rag p={r.spot} />
                  </td>
                  <td className="hidden sm:table-cell">
                    <Due v={r.sup1Due} />
                  </td>
                  <td className="hidden sm:table-cell">
                    <Done v={r.sup1Done} />
                  </td>
                  <td>
                    <Due v={r.sup2Due} />
                  </td>
                  <td>
                    <Done v={r.sup2Done} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
