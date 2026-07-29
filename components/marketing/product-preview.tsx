/**
 * The hero visual: what you hand the inspector, on top of what you watch every day.
 *
 * WHY IT LOOKS LIKE THIS. Two independent reviews, one marketing and one sales, were run on the
 * previous version and reached the same verdict from different directions.
 *
 *  - A red, amber, green table sells AWARENESS, and this buyer already has awareness. She has it
 *    at eleven o'clock on a Sunday night. What she does not have is PROOF. Her fear is not
 *    missing a supervision, it is standing in front of an inspector unable to show she did not.
 *    So the exported evidence, the OUTPUT, is now the thing in front.
 *  - Three big figures across the top was the first thing the eye hit and the least defensible
 *    pixel on the page. Worse, "Overdue 2" is a picture of the buyer failing, shown to the exact
 *    person who would be answering for it. Demoted to one quiet line.
 *  - The faux browser chrome said "mockup", which to a sceptic means "not real yet". Gone.
 *  - The People and Service Users TABS hid half the product. The two registers are the thing no
 *    general purpose tool does, and behind a tab nobody can click, that was invisible. The rows
 *    now MIX both registers in one list sorted worst first, which is the whole pitch in one
 *    design decision: no wall chart does that, and no HR system does that.
 *  - Job titles under every name read as an HR product. They now appear once, on the evidence
 *    document, where they add realism instead of noise.
 *  - Status is in WORDS as well as colour. Words survive colour blindness, a small screen, and a
 *    sceptic.
 *
 * ONE RED, NOT TWO. Marketing wanted the flinch of an overdue row at the top. Sales warned that a
 * wall of red reads as an accusation aimed at the manager reading it. One overdue, one due soon,
 * the rest ordinary and done.
 *
 * THE DETAIL IS THE CREDIBILITY. Fakes are always too tidy. UK date format, a named author, a
 * form version, a page number out of an odd total, and the vocabulary of the job spelled the way
 * the sector spells it. Everything shown is something the product genuinely produces.
 *
 * Decorative and aria-hidden: the names are invented, and a screen reader reading them out as
 * real records would be worse than silence. The copy around it says what the product does.
 */

type Tone = "green" | "amber" | "red";
type Row = { name: string; register: string; check: string; status: string; tone: Tone };

const ROWS: Row[] = [
  {
    name: "Margaret Hughes",
    register: "Person supported",
    check: "Care plan review",
    status: "14 days overdue",
    tone: "red",
  },
  {
    name: "Aled Price",
    register: "Staff",
    check: "DBS renewal",
    status: "Due in 6 days",
    tone: "amber",
  },
  {
    name: "Bethan Hughes",
    register: "Staff",
    check: "Supervision",
    status: "Done 28/08/2026",
    tone: "green",
  },
  {
    name: "Thomas Reed",
    register: "Person supported",
    check: "Risk assessment",
    status: "Done 01/09/2026",
    tone: "green",
  },
  {
    name: "Carys Evans",
    register: "Staff",
    check: "Moving and handling",
    status: "Valid to 03/10/2026",
    tone: "green",
  },
  {
    name: "Dylan Morgan",
    register: "Staff",
    check: "Spot check",
    status: "Done 20/09/2026",
    tone: "green",
  },
];

function pillClass(tone: Tone) {
  return tone === "green" ? "pill-green" : tone === "amber" ? "pill-amber" : "pill-red";
}

export default function ProductPreview() {
  return (
    <div aria-hidden className="relative text-left">
      {/* The register. Both populations in one list, worst first. */}
      <div className="glass-card overflow-hidden p-0 shadow-2xl shadow-black/40">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-white">Sunnybank House</p>
          <p className="text-[11px] text-white/60">
            2 overdue · 5 due in 14 days · 62 on the registers
          </p>
        </div>

        <ul className="divide-y divide-white/5">
          {ROWS.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-3 px-4 py-2.5 sm:py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{r.name}</p>
                <p className="truncate text-[11px] text-white/60">
                  {r.register} · {r.check}
                </p>
              </div>
              <span className={`${pillClass(r.tone)} shrink-0 text-[11px]`}>
                <span className="pill-dot" /> {r.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* The output. What actually ends the conversation with an inspector.
          Stacked underneath on a phone, overlapping the register on anything wider. */}
      <div className="mt-4 sm:absolute sm:bottom-4 sm:right-4 sm:mt-0 sm:w-[19rem]">
        <div className="rounded-xl bg-white p-4 shadow-2xl shadow-black/50 ring-1 ring-black/10">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-800">
            Supervision evidence · 12 months
          </p>
          <p className="mt-2 text-sm font-bold text-navy-950">Aled Price</p>
          <p className="text-[11px] text-navy-800">Senior Care Assistant</p>
          <div className="mt-3 space-y-1 border-t border-black/10 pt-3 text-[11px] text-navy-900">
            <p>Completed 14/03/2026 by Ceri Jones</p>
            <p>Form version 4, created 14/03/2026, not edited since</p>
            <p className="font-semibold">Next supervision due 12/09/2026</p>
          </div>
          <p className="mt-3 text-[10px] text-navy-800/70">Page 3 of 47</p>
        </div>
      </div>
    </div>
  );
}
