import { s } from "./class-names";
import { sceneDates } from "@/lib/marketing/scene-dates";

/**
 * Be Care Compliant: the Service User register, as the app draws it (Phil, 2026-10-14: in place of
 * a second dashboard picture, so the homepage shows both registers).
 *
 * The app's own classes and real column labels in the real order
 * (components/service-users/service-user-register.tsx): Service User, SSID, Status, Most Recent
 * Review, New Review Due, Audit, as a company with simple reviews shows them, fewer on a phone.
 * Status pills Active green and Hospital amber; a due date carries its RAG pill; while a service
 * user is in hospital their checks show the grey "Paused" pill. Dates are days from today. Calm:
 * nothing moves.
 */

type Pill = { text: string; tone: "green" | "amber" | "red" | "paused" };
type Row = {
  name: string;
  ssid: string;
  status: { text: string; tone: "green" | "amber" };
  recent: string;
  next: Pill;
  audit: Pill;
};

function rows(): Row[] {
  const t = sceneDates();
  const p = (days: number, tone: Pill["tone"]): Pill => ({ text: t.matrix(days), tone });
  const paused: Pill = { text: "Paused", tone: "paused" };
  return [
    { name: "Mair Jenkins", ssid: "RIV01042", status: { text: "Active", tone: "green" }, recent: t.matrix(-58), next: p(32, "green"), audit: p(84, "green") },
    { name: "Gwyn Thomas", ssid: "RIV01057", status: { text: "Hospital", tone: "amber" }, recent: t.matrix(-96), next: paused, audit: paused },
    { name: "Sian Price", ssid: "RIV01063", status: { text: "Active", tone: "green" }, recent: t.matrix(-21), next: p(69, "green"), audit: p(9, "amber") },
    { name: "Alun Hughes", ssid: "RIV01071", status: { text: "Active", tone: "green" }, recent: t.matrix(-95), next: p(-5, "red"), audit: p(47, "green") },
    { name: "Eleri Morgan", ssid: "RIV01088", status: { text: "Active", tone: "green" }, recent: t.matrix(-78), next: p(12, "amber"), audit: p(102, "green") },
  ];
}

function Rag({ p }: { p: Pill }) {
  return <span className={`rag-cell rag-cell-${p.tone}`}>{p.text}</span>;
}

export default function SuScene() {
  return (
    <div className={s.frame}>
      <p className="sr-only">
        The Service User register in Be Care Compliant: each person supported with their care plan reviews and
        audit, due dates in red, amber or green, and checks paused while someone is in hospital.
      </p>
      <div aria-hidden className="p-4 sm:p-5">
        <p className="page-title">Compliance</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-white">Branches</span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-white">Riverside</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-white">View</span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-white">Matrix</span>
          </span>
        </div>
        <p className="mt-2 text-right text-[11px] text-white/55">5 records</p>
        <div className={`mt-1 ${s.matrixClip} ${s.compact} ${s.wrapHead}`}>
          <table className="matrix">
            <thead>
              <tr>
                <th className="col-carer">Service User</th>
                <th className="hidden 2xl:table-cell">SSID</th>
                <th>Status</th>
                <th className="hidden sm:table-cell">Most Recent Review</th>
                <th>New Review Due</th>
                <th className="hidden md:table-cell">Audit</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.name}>
                  <td className="col-carer">{r.name}</td>
                  <td className="hidden 2xl:table-cell">{r.ssid}</td>
                  <td>
                    <span className={`pill-${r.status.tone}`}>{r.status.text}</span>
                  </td>
                  <td className="hidden sm:table-cell">{r.recent}</td>
                  <td>
                    <Rag p={r.next} />
                  </td>
                  <td className="hidden md:table-cell">
                    <Rag p={r.audit} />
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
