/**
 * Decorative example of a local authority quality return. Mirrors the real report in
 * lib/export/on-time.ts: on time completion rates with starred quality measures and a
 * score band (100 = 10, 85 to 99.99 = 7, 70 to 84.99 = 5, 50 to 69.99 = 2, under 50 = 0).
 * Marketing copy names no city, authority or company. Static and illustrative.
 */

type Row = {
  name: string;
  register: string;
  gradedAt: string;
  rate: number;
  score: number;
  star: boolean;
};

const ROWS: Row[] = [
  { name: "Supervision", register: "People", gradedAt: "90 days", rate: 91.7, score: 7, star: true },
  { name: "Care plan review", register: "Service Users", gradedAt: "90 days", rate: 100, score: 10, star: true },
  { name: "Mandatory training", register: "People", gradedAt: "All courses", rate: 96.0, score: 7, star: true },
  { name: "Staff registration", register: "People", gradedAt: "6 months in post", rate: 100, score: 10, star: true },
  { name: "Safeguarding training", register: "People", gradedAt: "Safeguarding", rate: 88.0, score: 7, star: true },
  { name: "Spot check", register: "People", gradedAt: "90 days", rate: 83.3, score: 5, star: false },
];

function rateTone(rate: number): "green" | "amber" | "red" {
  return rate >= 85 ? "green" : rate >= 50 ? "amber" : "red";
}
function scoreTone(score: number): "green" | "amber" | "red" {
  return score >= 10 ? "green" : score >= 5 ? "amber" : "red";
}
function pill(tone: "green" | "amber" | "red") {
  return tone === "green" ? "pill-green" : tone === "amber" ? "pill-amber" : "pill-red";
}

export default function PqsReportPreview() {
  return (
    <div className="glass-card overflow-hidden p-0 text-left shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 text-xs text-white/45">PQS report, your service</span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-white">On time completion rates</h3>
            <p className="text-xs text-white/45">Provider Quality System (PQS) return, last 6 months</p>
          </div>
          <span className="rounded-lg bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-300">
            Export PDF or CSV
          </span>
        </div>

        <div className="mt-4">
          <table className="w-full border-separate border-spacing-y-1.5 text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-white/45">
                <th className="px-1 py-1 text-left font-medium">Measure</th>
                <th className="px-1 py-1 text-right font-medium">On time</th>
                <th className="px-1 py-1 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <td className="px-1 py-1.5">
                    <span className="font-semibold text-white">
                      {r.star ? <span className="mr-1 text-gold-400" aria-label="PQS measure">&#9733;</span> : null}
                      {r.name}
                    </span>
                    <span className="ml-2 text-[11px] text-white/40">{r.register}</span>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <span className={`${pill(rateTone(r.rate))} text-[11px]`}>
                      <span className="pill-dot" /> {r.rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <span className={`${pill(scoreTone(r.score))} text-[11px]`}>{r.score}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-white/40">
          A star marks a PQS measure. Scores band the on time rate the way the PQS scores it, so you know exactly
          where you stand before you submit.
        </p>
      </div>
    </div>
  );
}
