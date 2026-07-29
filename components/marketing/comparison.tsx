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

function Cell({ mark }: { mark: Mark; strong?: boolean }) {
  if (mark === "yes") {
    return (
      <span role="img" aria-label="Yes" className="text-xl font-bold text-gold-400">
        &#10003;
      </span>
    );
  }
  if (mark === "limited") {
    return <span className="text-xs text-white/60">Limited</span>;
  }
  return (
    <span role="img" aria-label="No" className="text-lg font-bold text-red-400">
      &#10005;
    </span>
  );
}

export default function Comparison() {
  return (
    <div className="glass-card overflow-x-auto p-2 sm:p-4">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="px-3 py-3 text-left text-sm font-bold text-white">How it compares</th>
            {COLS.map((c, i) => (
              <th
                scope="col"
                key={c}
                className={`px-3 py-3 text-center align-bottom text-xs font-bold ${
                  i === 2 ? "text-gold-400" : "text-white"
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-t border-white/10">
              <th scope="row" className="px-3 py-3 text-left font-normal text-white/80">
                {r.label}
              </th>
              {r.marks.map((m, i) => (
                <td key={i} className="px-3 py-3 text-center">
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
