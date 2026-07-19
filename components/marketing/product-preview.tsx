/**
 * Decorative product preview for the marketing hero: a stylised compliance matrix
 * so visitors immediately see the red, amber, green picture the product gives them.
 * Static and non interactive on purpose. Uses the same pill classes as the app.
 */

type Cell = { label: string; tone: "green" | "amber" | "red" };

const COLS = ["Supervision", "Spot check", "DBS", "Training"];
const ROWS: Array<{ name: string; role: string; cells: Cell[] }> = [
  {
    name: "Aled Price",
    role: "Care Assistant",
    cells: [
      { label: "12 Sep", tone: "green" },
      { label: "03 Oct", tone: "green" },
      { label: "Due soon", tone: "amber" },
      { label: "Valid", tone: "green" },
    ],
  },
  {
    name: "Bethan Hughes",
    role: "Senior Carer",
    cells: [
      { label: "28 Aug", tone: "green" },
      { label: "Due soon", tone: "amber" },
      { label: "Valid", tone: "green" },
      { label: "Overdue", tone: "red" },
    ],
  },
  {
    name: "Carys Evans",
    role: "Care Coordinator",
    cells: [
      { label: "01 Sep", tone: "green" },
      { label: "15 Sep", tone: "green" },
      { label: "Valid", tone: "green" },
      { label: "Valid", tone: "green" },
    ],
  },
  {
    name: "Dylan Morgan",
    role: "Care Assistant",
    cells: [
      { label: "Overdue", tone: "red" },
      { label: "20 Sep", tone: "green" },
      { label: "Due soon", tone: "amber" },
      { label: "Valid", tone: "green" },
    ],
  },
];

function pillClass(tone: Cell["tone"]) {
  return tone === "green" ? "pill-green" : tone === "amber" ? "pill-amber" : "pill-red";
}

export default function ProductPreview() {
  return (
    <div className="glass-card overflow-hidden p-0 text-left shadow-2xl shadow-black/40">
      {/* Faux window bar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 text-xs text-white/45">People compliance, North branch</span>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-white/45">
              <th className="px-2 py-1 text-left font-medium">Carer</th>
              {COLS.map((c) => (
                <th key={c} className="px-2 py-1 text-center font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name}>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <div className="font-semibold text-white">{r.name}</div>
                  <div className="text-[11px] text-white/45">{r.role}</div>
                </td>
                {r.cells.map((cell, i) => (
                  <td key={i} className="px-2 py-1.5 text-center">
                    <span className={`${pillClass(cell.tone)} text-[11px]`}>
                      <span className="pill-dot" /> {cell.label}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
