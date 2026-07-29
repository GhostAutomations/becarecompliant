/**
 * The hero product preview: a stylised slice of the real application.
 *
 * WHY IT LOOKS LIKE THIS. The first version was a four by four table of names and status
 * pills. It had three problems. It read as a SPREADSHEET on a site whose central argument is
 * that spreadsheets are the enemy. It showed only the People register, so the two register
 * model, which is the thing no general tool does, was invisible. And it showed one screen
 * while the headline claims an operating system.
 *
 * So the matrix stayed, and the application was put around it: company level figures at the
 * top, both registers as tabs, and the branch the matrix belongs to. Status now visibly rolls
 * up from a single check on one carer, to a branch, to the company, which is exactly what a
 * spreadsheet cannot do and what the word platform has to earn.
 *
 * EVERYTHING HERE EXISTS IN THE PRODUCT. Overdue and Due in 14 days are real dashboard cards.
 * The registers, the branch scope and the red, amber, green cells are real. Nothing is a
 * number we cannot produce, which is the same rule the Security section on the homepage
 * follows.
 *
 * Decorative, static and aria-hidden: the names and dates are invented, so a screen reader
 * reading them out as though they were real records would be worse than silence. The copy
 * around it already says what the product does.
 */

type Tone = "green" | "amber" | "red" | "none";
type Cell = { label: string; tone: Tone };

function pillClass(tone: Tone) {
  if (tone === "green") return "pill-green";
  if (tone === "amber") return "pill-amber";
  if (tone === "red") return "pill-red";
  return "pill-neutral";
}

/** Company level, the top of the rollup. */
const STATS: Array<{ label: string; value: string; tone: Tone }> = [
  { label: "Overdue", value: "2", tone: "red" },
  { label: "Due in 14 days", value: "5", tone: "amber" },
  { label: "On the registers", value: "62", tone: "none" },
];

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

export default function ProductPreview() {
  return (
    <div
      aria-hidden
      className="glass-card overflow-hidden p-0 text-left shadow-2xl shadow-black/40"
    >
      {/* Faux window bar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 text-xs text-white/55">Sunrise Home Care</span>
      </div>

      {/* Company level. The top of the rollup. */}
      <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-white/10">
        {STATS.map((s) => (
          <div key={s.label} className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-white/55">{s.label}</p>
            <p
              className={`mt-0.5 text-xl font-bold ${
                // NOT text-rag-red / text-rag-amber: those theme colours (#dc2626, #b45309)
                // are the LIGHT theme pill inks and go muddy on navy. These are the same
                // shades every other dark surface in the app uses for status text.
                s.tone === "red"
                  ? "text-red-300"
                  : s.tone === "amber"
                    ? "text-amber-300"
                    : "text-white"
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Both registers, and the branch this view is scoped to. */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-1">
          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
            People
          </span>
          <span className="rounded-lg px-2.5 py-1 text-[11px] text-white/55">Service Users</span>
        </div>
        <span className="whitespace-nowrap text-[11px] text-white/55">North branch</span>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-white/55">
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
                  {/* The job title was in the data all along and never rendered. It costs one
                      line and makes the mock read as a staff record rather than a row. */}
                  <div className="text-[11px] text-white/55">{r.role}</div>
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
