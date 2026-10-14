import { s } from "./class-names";
import { sceneDates } from "@/lib/marketing/scene-dates";

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

/* Dates are days from today (lib/marketing/scene-dates.ts), so the picture never goes stale. The
   colours follow the app's rules: a supervision due over 14 days away is green, inside 14 amber,
   past it red; an Enhanced DBS ambers 90 days out; a supervision done after its due date is amber. */
function rows(): Row[] {
  const t = sceneDates();
  const pill = (days: number, tone: Pill["tone"]): Pill => ({ text: t.matrix(days), tone });
  return [
    {
      name: "Ffion Rees",
      status: { text: "Active", tone: "green" },
      job: "Care Assistant",
      edbs: pill(505, "green"),
      spot: pill(7, "amber"),
      sup1Due: t.matrix(-124),
      sup1Done: { text: t.matrix(-126) },
      sup2Due: pill(-32, "red"),
      sup2Done: null,
    },
    {
      name: "Owain Pugh",
      status: { text: "Active", tone: "green" },
      job: "Senior Care Assistant",
      edbs: pill(309, "green"),
      spot: pill(49, "green"),
      sup1Due: t.matrix(-162),
      sup1Done: { text: t.matrix(-165) },
      sup2Due: t.matrix(-70),
      sup2Done: { text: t.matrix(-64), late: true },
    },
    {
      name: "Hannah Cole",
      status: { text: "Active", tone: "green" },
      job: "Care Assistant",
      edbs: pill(45, "amber"),
      spot: pill(63, "green"),
      sup1Due: t.matrix(-35),
      sup1Done: { text: t.matrix(-40) },
      sup2Due: pill(56, "green"),
      sup2Done: null,
    },
    {
      name: "Priya Shah",
      status: { text: "Active", tone: "green" },
      job: "Care Assistant",
      edbs: pill(454, "green"),
      spot: pill(83, "green"),
      sup1Due: pill(10, "amber"),
      sup1Done: null,
      sup2Due: none,
      sup2Done: null,
    },
    {
      name: "Megan Lloyd",
      status: { text: "Mat Leave", tone: "amber" },
      job: "Care Assistant",
      edbs: pill(266, "green"),
      spot: pill(35, "green"),
      sup1Due: t.matrix(-177),
      sup1Done: { text: t.matrix(-180) },
      sup2Due: t.matrix(-86),
      sup2Done: { text: t.matrix(-91) },
    },
    {
      name: "Rhian Bowen",
      status: { text: "Active", tone: "green" },
      job: "Registered Manager",
      edbs: pill(496, "green"),
      spot: pill(108, "green"),
      sup1Due: t.matrix(-92),
      sup1Done: { text: t.matrix(-98) },
      sup2Due: pill(85, "green"),
      sup2Done: null,
    },
  ];
}

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
              {rows().map((r) => (
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
