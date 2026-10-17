/**
 * Be Care Compliant: the monthly MAR chart, the pure half (Rota and Visits Stage 6, Phil's popup
 * 2026-10-17 "Monthly MAR chart and weekly rota"; docs/decisions/rota-visits.md, Stage 6).
 * Importless apart from other pure modules, so node --test runs it.
 *
 * Laid out like a paper MAR (NICE NG67 1.5.5): the service user's details and allergies at the top,
 * every medicine with its label dose, then a grid with each medicine and call down the side and the
 * days across, in two halves so it stays readable on A4 landscape. A dose given shows the carer's
 * initials; not given shows R, N or O with the reasons listed below; a dose that was due and not
 * recorded shows X in red. It records what carers recorded: no dose is worked out.
 *
 * The grid uses each medicine's current version for when it is due (a change during the month
 * shows from its check onwards in the medicines list, not as a split row). A stopped medicine is
 * due only until the day it was stopped.
 */

import { MAR_SLOTS, OUTCOME_CODES, OUTCOME_LABELS, SUPPORT_SHORT, dayWords, doseReasonLabel, dueAt, nhsNumberShown, slotWords, type DoseOutcome, type Support } from "./mar.ts";

export type ChartMed = {
  medUid: string;
  name: string;
  doseText: string;
  doseQuantity: number | null;
  doseUnit: string | null;
  support: Support;
  prn: boolean;
  slots: string[];
  days: number[] | null;
  route: string | null;
  timeSensitive: boolean;
  instructions: string | null;
  startDate: string;
  stopDate: string | null;
  status: "awaiting_check" | "live" | "replaced" | "stopped";
  stoppedAt: string | null;
  stopReason: string | null;
  checkedByName: string | null;
};
export type ChartDose = {
  visitId: string;
  medUid: string;
  author: string;
  slot: string;
  outcome: DoseOutcome;
  reasonCode: string | null;
  reasonText: string | null;
  quantity: number | null;
  at: string;
};
export type ChartVisit = { id: string; date: string; slot: string; clockedOut: boolean };

export type MarChartInput = {
  companyName: string;
  branchName: string;
  serviceUserName: string;
  ssid: string | null;
  dateOfBirth: string | null;
  nhsNumber: string | null;
  gpPractice: string | null;
  allergies: string | null;
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD, London
  madeAt: string;
  meds: ChartMed[];
  visits: ChartVisit[];
  doses: ChartDose[];
};

// The shared PDF document model, written out here so this file stays importless.
type Pair = { label: string; value: string };
type Cell = { text: string; strong?: boolean; rag?: "green" | "amber" | "red" | "neutral" };
type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; columns: { header: string; width?: string }[]; rows: Cell[][]; emptyText?: string }
  | { kind: "spacer" };
export type MarChartDoc = {
  title: string;
  subtitle?: string;
  reference?: string;
  meta?: Pair[];
  blocks: Block[];
  footerNote?: string;
  kicker?: string;
  landscape?: boolean;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY2 = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function londonDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
}
function londonTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function ukDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
/** Days in a month, leap years included (Date.UTC day 0 of the next month). */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export function monthWords(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
/** "Gethin Jones" gives "GJ"; one name gives its first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function isoDow(dateIso: string): number {
  return (new Date(`${dateIso}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 Monday
}

/** Is this medicine due on this day at this call, for the chart (a stopped one only before it stopped)? */
function dueOnChart(m: ChartMed, date: string, slot: string): boolean {
  if (m.status === "stopped" && m.stoppedAt && date > londonDay(m.stoppedAt)) return false;
  return dueAt({ prn: m.prn, slots: m.slots, days: m.days, start_date: m.startDate, stop_date: m.stopDate, dose_quantity: m.doseQuantity }, date, slot);
}

/** One grid cell: initials when given, a code when not, X when due and not recorded, an empty box when due later, blank when not due. */
export function chartCell(m: ChartMed, date: string, slot: string, input: Pick<MarChartInput, "today" | "visits" | "doses">): Cell {
  if (!dueOnChart(m, date, slot)) return { text: "" };
  const visitIds = new Set(input.visits.filter((v) => v.date === date && v.slot === slot).map((v) => v.id));
  const doses = input.doses.filter((d) => d.medUid === m.medUid && visitIds.has(d.visitId));
  const latest = doses.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[doses.length - 1];
  if (latest) {
    return latest.outcome === "given"
      ? { text: initials(latest.author), rag: "green" }
      : { text: OUTCOME_CODES[latest.outcome], strong: true, rag: "amber" };
  }
  // A medicine stopped that day with nothing recorded: no box to fill (it is not due any more).
  if (m.status === "stopped" && m.stoppedAt && date === londonDay(m.stoppedAt)) return { text: "" };
  const visitsHere = input.visits.filter((v) => v.date === date && v.slot === slot);
  const over = date < input.today || (date === input.today && visitsHere.length > 0 && visitsHere.every((v) => v.clockedOut));
  // Due and not yet due: a light empty box to write in by hand if the phones are down (decision 9).
  return over ? { text: "X", strong: true, rag: "red" } : { text: "\u00a0\u00a0\u00a0\u00a0", rag: "neutral" };
}

/** The monthly MAR chart as the shared report PDF's document (landscape). */
export function buildMarChart(input: MarChartInput): MarChartDoc {
  const days = monthDays(input.month);
  const inMonth = (iso: string) => londonDay(iso).startsWith(input.month);
  const meds = input.meds.filter((m) => m.status === "live" || m.status === "stopped");
  const regular = meds.filter((m) => !m.prn);
  const slotOrder = MAR_SLOTS.map((s) => s.value);
  const slotLabel = new Map(MAR_SLOTS.map((s) => [s.value, s.label]));
  const blocks: Block[] = [];

  blocks.push({ kind: "heading", text: "Medicines" });
  blocks.push({
    kind: "table",
    columns: [
      { header: "Medicine", width: "22%" },
      { header: "Dose, as on the label", width: "24%" },
      { header: "Support", width: "8%" },
      { header: "When", width: "18%" },
      { header: "Route", width: "8%" },
      { header: "Dates and check", width: "20%" },
    ],
    rows: meds.map((m) => [
      { text: `${m.name}${m.timeSensitive ? " (time sensitive)" : ""}`, strong: true },
      { text: m.instructions ? `${m.doseText}\n${m.instructions}` : m.doseText },
      { text: SUPPORT_SHORT[m.support] },
      { text: m.prn ? "When required" : `${slotWords(m.slots)}, ${m.days ? dayWords(m.days) : "every day"}` },
      { text: m.route ?? "" },
      {
        text: [
          `From ${ukDate(m.startDate)}${m.stopDate ? ` to ${ukDate(m.stopDate)}` : ""}`,
          m.checkedByName ? `Checked by ${m.checkedByName}` : "",
          m.status === "stopped" ? `Stopped ${ukDate(m.stoppedAt)}${m.stopReason ? `: ${m.stopReason}` : ""}` : "",
        ].filter(Boolean).join(". "),
        rag: m.status === "stopped" ? "neutral" : undefined,
      },
    ]),
    emptyText: "No medicines are live on this MAR.",
  });

  const halves = [days.slice(0, 16), days.slice(16)];
  for (const half of halves) {
    const first = Number(half[0].slice(8));
    const last = Number(half[half.length - 1].slice(8));
    blocks.push({ kind: "heading", text: `${first} to ${last} ${monthWords(input.month)}` });
    const dayWidth = `${(78 / half.length).toFixed(3)}%`;
    const rows: Cell[][] = [];
    for (const m of regular) {
      for (const slot of [...m.slots].sort((a, b) => slotOrder.indexOf(a) - slotOrder.indexOf(b))) {
        rows.push([{ text: `${m.name}\n${slotLabel.get(slot) ?? slot}` }, ...half.map((d) => chartCell(m, d, slot, input))]);
      }
    }
    blocks.push({
      kind: "table",
      columns: [{ header: "Medicine and call", width: "22%" }, ...half.map((d) => ({ header: `${DAY2[isoDow(d)]} ${Number(d.slice(8))}`, width: dayWidth }))],
      rows,
      emptyText: "No regular medicines.",
    });
  }
  blocks.push({
    kind: "paragraph",
    text: "Key. Initials: given by that carer. R: refused. N: not available. O: other. The reasons are listed below. X: due and not recorded. Grey box: due, not yet recorded; write in by hand if the app cannot be used. Blank: not due.",
  });

  const medOf = new Map(input.meds.map((m) => [m.medUid, m]));
  const monthDoses = input.doses.filter((d) => inMonth(d.at)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  blocks.push({ kind: "heading", text: "Doses not given" });
  blocks.push({
    kind: "table",
    columns: [{ header: "Date", width: "10%" }, { header: "Time", width: "8%" }, { header: "Medicine", width: "30%" }, { header: "Outcome and reason", width: "34%" }, { header: "Carer", width: "18%" }],
    rows: monthDoses
      .filter((d) => d.outcome !== "given")
      .map((d) => [
        { text: ukDate(londonDay(d.at)) },
        { text: londonTime(d.at) },
        { text: medOf.get(d.medUid)?.name ?? "Medicine" },
        { text: `${OUTCOME_LABELS[d.outcome]}: ${doseReasonLabel(d.reasonCode, d.reasonText) ?? ""}`, rag: "amber" as const },
        { text: d.author },
      ]),
    emptyText: "Every dose recorded this month was given.",
  });

  blocks.push({ kind: "heading", text: "When required doses" });
  blocks.push({
    kind: "table",
    columns: [{ header: "Date", width: "10%" }, { header: "Time", width: "8%" }, { header: "Medicine", width: "34%" }, { header: "How many", width: "14%" }, { header: "Outcome", width: "16%" }, { header: "Carer", width: "18%" }],
    rows: monthDoses
      .filter((d) => medOf.get(d.medUid)?.prn)
      .map((d) => {
        const m = medOf.get(d.medUid);
        return [
          { text: ukDate(londonDay(d.at)) },
          { text: londonTime(d.at) },
          { text: m?.name ?? "Medicine" },
          { text: d.quantity != null ? `${d.quantity.toLocaleString("en-GB")}${m?.doseUnit ? ` ${m.doseUnit}` : ""}` : "" },
          { text: OUTCOME_LABELS[d.outcome] },
          { text: d.author },
        ];
      }),
    emptyText: "No when required doses this month.",
  });

  return {
    title: "MAR chart",
    kicker: "Medicines administration record",
    subtitle: `${input.serviceUserName}${input.ssid ? ` (${input.ssid})` : ""}, ${monthWords(input.month)}`,
    reference: `MAR ${input.month}`,
    landscape: true,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Branch", value: input.branchName },
      { label: "Allergies", value: input.allergies?.trim() || "Not recorded" },
      { label: "Date of birth", value: ukDate(input.dateOfBirth) || "Not recorded" },
      { label: "NHS number", value: input.nhsNumber ? nhsNumberShown(input.nhsNumber) : "Not recorded" },
      { label: "GP practice", value: input.gpPractice?.trim() || "Not recorded" },
    ],
    blocks,
    footerNote:
      "Beta, test data only. This chart shows what carers recorded at their visits; it makes no dose calculations and gives no clinical advice. Follow the label and call the office or the pharmacist if unsure.",
  };
}
