/**
 * Comparison table: the status quo (spreadsheets, wall charts, generic workflow
 * tools) versus a purpose built care compliance platform. Claims are framed against
 * the status quo, not against a named competitor, so every row is accurate and fair.
 */

type Mark = "yes" | "no" | "limited";

const COLS = ["Spreadsheets and wall charts", "Generic workflow tools", "Be Care Compliant"] as const;

const ROWS: Array<{ label: string; marks: [Mark, Mark, Mark] }> = [
  { label: "Purpose built for CQC and CIW", marks: ["no", "no", "yes"] },
  { label: "Checks that complete and reschedule themselves", marks: ["no", "limited", "yes"] },
  { label: "Red, amber, green rollup from check to company", marks: ["no", "limited", "yes"] },
  { label: "Inspector ready evidence, exportable to PDF and CSV", marks: ["no", "no", "yes"] },
  { label: "Reminders and chasers built in", marks: ["no", "limited", "yes"] },
  { label: "Audit trail on every access and change", marks: ["no", "limited", "yes"] },
  { label: "Built for special category health data", marks: ["no", "no", "yes"] },
  { label: "Staff and service users in one place", marks: ["limited", "limited", "yes"] },
];

function Cell({ mark, strong }: { mark: Mark; strong: boolean }) {
  if (mark === "yes") {
    return <span className={`text-lg ${strong ? "text-gold-400" : "text-white/80"}`} aria-label="Yes">&#10003;</span>;
  }
  if (mark === "limited") {
    return <span className="text-xs text-white/45" aria-label="Limited">Limited</span>;
  }
  return <span className="text-base text-white/25" aria-label="No">&#10005;</span>;
}

export default function Comparison() {
  return (
    <div className="glass-card overflow-x-auto p-2 sm:p-4">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-3 py-3 text-left font-medium text-white/50">How it compares</th>
            {COLS.map((c, i) => (
              <th
                key={c}
                className={`px-3 py-3 text-center align-bottom text-xs font-semibold ${
                  i === 2 ? "text-white" : "text-white/55"
                }`}
              >
                {i === 2 ? (
                  <span className="inline-block rounded-t-lg bg-gold-400/10 px-3 py-1 text-gold-300">{c}</span>
                ) : (
                  c
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-t border-white/10">
              <td className="px-3 py-3 text-left text-white/80">{r.label}</td>
              {r.marks.map((m, i) => (
                <td key={i} className={`px-3 py-3 text-center ${i === 2 ? "bg-gold-400/[0.06]" : ""}`}>
                  <Cell mark={m} strong={i === 2} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
