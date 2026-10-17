/**
 * Be Care Compliant: the weekly rota PDF, the pure half (Rota and Visits Stage 6, Phil's popup
 * 2026-10-17 "Monthly MAR chart and weekly rota"; docs/decisions/rota-visits.md, Stage 6 decision
 * 9). The paper fallback: each carer's visits by day, then the visits still needing a carer.
 * Importless, so node --test runs it. No dashes in any copy.
 */

export type PrintVisit = {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  serviceUserName: string;
  postcode: string | null;
  service: string | null;
  status: "draft" | "published" | "cancelled";
  paused: boolean;
  carersNeeded: number;
  carers: { personId: string; name: string }[];
  timeSensitive: boolean;
};
export type RotaPrintInput = { companyName: string; branchName: string; monday: string; madeAt: string; visits: PrintVisit[] };

type Pair = { label: string; value: string };
type Cell = { text: string; strong?: boolean; rag?: "green" | "amber" | "red" | "neutral" };
type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; columns: { header: string; width?: string }[]; rows: Cell[][]; emptyText?: string };
export type RotaPrintDoc = { title: string; subtitle?: string; reference?: string; meta?: Pair[]; blocks: Block[]; footerNote?: string; kicker?: string };

function dayWords(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const byTime = (a: PrintVisit, b: PrintVisit) => (a.date + a.startTime).localeCompare(b.date + b.startTime);

function row(v: PrintVisit, others: string): Cell[] {
  const notes = [v.status === "draft" ? "Draft" : "", v.paused ? "Paused" : "", v.timeSensitive ? "Time sensitive medicine" : "", others].filter(Boolean).join(". ");
  return [
    { text: dayWords(v.date) },
    { text: `${v.startTime} to ${v.endTime}`, strong: true },
    { text: v.serviceUserName },
    { text: v.postcode ?? "" },
    { text: v.service ?? "Visit" },
    { text: notes, rag: v.timeSensitive ? "red" : v.status === "draft" || v.paused ? "amber" : undefined },
  ];
}
const COLUMNS = [
  { header: "Day", width: "12%" },
  { header: "Time", width: "13%" },
  { header: "Service user", width: "22%" },
  { header: "Postcode", width: "11%" },
  { header: "Service", width: "14%" },
  { header: "Notes", width: "28%" },
];

/** The week's rota as the shared report PDF's document: one section a carer, A to Z, then the gaps. */
export function buildRotaPrint(input: RotaPrintInput): RotaPrintDoc {
  const live = input.visits.filter((v) => v.status !== "cancelled").sort(byTime);
  const carers = new Map<string, string>();
  for (const v of live) for (const c of v.carers) carers.set(c.personId, c.name);
  const blocks: Block[] = [];
  for (const [id, name] of [...carers.entries()].sort((a, b) => a[1].localeCompare(b[1], "en-GB"))) {
    const mine = live.filter((v) => v.carers.some((c) => c.personId === id));
    blocks.push({ kind: "heading", text: `${name} (${mine.length} visit${mine.length === 1 ? "" : "s"})` });
    blocks.push({
      kind: "table",
      columns: COLUMNS,
      rows: mine.map((v) => {
        const with_ = v.carers.filter((c) => c.personId !== id).map((c) => c.name);
        return row(v, with_.length ? `With ${with_.join(" and ")}` : "");
      }),
    });
  }
  const gaps = live.filter((v) => v.carers.length < v.carersNeeded);
  blocks.push({ kind: "heading", text: "Visits needing a carer" });
  blocks.push({
    kind: "table",
    columns: COLUMNS,
    rows: gaps.map((v) => row(v, `${v.carers.length} of ${v.carersNeeded} carers`)),
    emptyText: "Every visit this week has its carers.",
  });
  if (carers.size === 0 && live.length === 0) blocks.unshift({ kind: "paragraph", text: "There are no visits on the rota for this week." });

  return {
    title: "Weekly rota",
    kicker: "Rota and Visits",
    subtitle: `${input.branchName}, week of ${dayWords(input.monday)} to ${dayWords(addDays(input.monday, 6))}`,
    reference: `Rota ${input.monday}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Branch", value: input.branchName },
      { label: "Visits", value: String(live.length) },
    ],
    blocks,
    footerNote: "A paper copy of the rota as it stood when printed. The app has the latest changes; drafts are not yet sent to carers.",
  };
}
