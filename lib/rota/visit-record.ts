/**
 * Be Care Compliant: the Visit record, the pure half (Rota and Visits Stage 5, Phil 2026-10-16:
 * "everything that's recorded from the time they click clock in"; docs/decisions/rota-visits.md,
 * Stage 5 decisions 2 and 4). Importless apart from other pure modules, so node --test runs it.
 *
 * One record per visit: clock in and out (time, how, and where as a result and a distance, never
 * the map position), every task outcome with its reason, the notes (corrections linked), any
 * concern, and the flags. Version 1 is made at clock out; something arriving later makes a new
 * version, and each version shows what had arrived by its made_at, so a PDF never changes.
 *
 * Builds the shared report PDF's document model (lib/export/pdf.tsx, ReportDoc), so the Visit
 * record looks like every other Be Care Compliant PDF. No dashes in any copy.
 */

import { flagWords, reasonLabel } from "./clock.ts";
import { OUTCOME_WORDS, taskReasonLabel, type TaskOutcomeKind } from "./tasks.ts";

export type RecordClock = {
  personId: string;
  kind: "in" | "out";
  at: string;
  method: string;
  location: string;
  distance_m: number | null;
  accuracy_m: number | null;
  reason_code: string | null;
  reason_text: string | null;
  flags: string[];
  added_reason: string | null;
};
export type RecordTask = {
  personId: string;
  name: string;
  isKey: boolean;
  outcome: TaskOutcomeKind;
  reason_code: string | null;
  reason_text: string | null;
  at: string;
  flags: string[];
};
export type RecordNote = {
  id: string;
  personId: string;
  author: string;
  body: string;
  at: string;
  forNextCarer: boolean;
  correctsNoteId: string | null;
  flags: string[];
};
export type RecordConcern = { personId: string; author: string; category: string; body: string; at: string; status: string };

export type VisitRecordInput = {
  companyName: string;
  branchName: string;
  serviceUserName: string;
  ssid: string | null;
  visitDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  service: string;
  version: number;
  madeAt: string;
  carers: { personId: string; name: string }[];
  clocks: RecordClock[];
  tasks: RecordTask[];
  notes: RecordNote[];
  concerns: RecordConcern[];
};

// The shared PDF document model, written out here so this file stays importless.
type Pair = { label: string; value: string };
type Cell = { text: string; strong?: boolean; rag?: "green" | "amber" | "red" | "neutral" };
type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "keyvalues"; pairs: Pair[] }
  | { kind: "table"; columns: { header: string; width?: string }[]; rows: Cell[][]; emptyText?: string }
  | { kind: "spacer" };
export type VisitRecordDoc = {
  title: string;
  subtitle?: string;
  reference?: string;
  meta?: Pair[];
  blocks: Block[];
  footerNote?: string;
  kicker?: string;
};

export function londonTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
export function londonDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}
function dayWords(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

const METHOD_WORDS: Record<string, string> = { gps: "GPS", qr: "QR code", nfc: "NFC sticker", text: "text message", office: "the office" };

/**
 * Where a clock in or out was, in words (Phil's popup: the result and the distance, never the map
 * position): "by GPS, inside the home's area, 12 m away, accurate to 5 m".
 */
export function clockWhere(c: Pick<RecordClock, "method" | "location" | "distance_m" | "accuracy_m" | "reason_code" | "reason_text" | "flags" | "added_reason">): string {
  const how = `by ${METHOD_WORDS[c.method] ?? c.method}`;
  const away = c.distance_m != null ? `${c.distance_m.toLocaleString("en-GB")} m away` : null;
  const acc = c.accuracy_m != null ? `accurate to ${Math.round(c.accuracy_m).toLocaleString("en-GB")} m` : null;
  switch (c.location) {
    case "inside":
      return [how, "inside the home's area", away, acc].filter(Boolean).join(", ");
    case "outside": {
      const why = c.reason_code === "other" ? c.reason_text || "Other" : reasonLabel(c.reason_code);
      return [how, "outside the home's area", away, acc, why ? `reason: ${why}` : "no reason given"].filter(Boolean).join(", ");
    }
    case "proved":
      return c.flags.includes("code_far") && away ? `${how} at the door, though the phone put it ${away}` : `${how} at the door`;
    case "text":
      return "by text message";
    case "office":
      return c.added_reason ? `added by the office: ${c.added_reason}` : "added by the office";
    default:
      return [how, "location unclear", acc].filter(Boolean).join(", ");
  }
}

function flagList(flags: string[]): string {
  return flags.length ? flags.map(flagWords).join("; ") : "";
}

/** The Visit record as the shared report PDF's document. */
export function buildVisitRecord(v: VisitRecordInput): VisitRecordDoc {
  const nameOf = new Map(v.carers.map((c) => [c.personId, c.name]));
  const who = (id: string) => nameOf.get(id) ?? "Carer";
  const blocks: Block[] = [];

  // Clock in and out.
  blocks.push({ kind: "heading", text: "Clock in and out" });
  const clocks = [...v.clocks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  blocks.push({
    kind: "table",
    columns: [{ header: "Carer", width: "22%" }, { header: "What", width: "14%" }, { header: "Time", width: "10%" }, { header: "How and where", width: "54%" }],
    rows: clocks.map((c) => [
      { text: who(c.personId) },
      { text: c.kind === "in" ? "Clock in" : "Clock out", strong: true },
      { text: londonTime(c.at) },
      { text: [clockWhere(c), flagList(c.flags)].filter(Boolean).join(". "), rag: c.location === "outside" || c.location === "unclear" ? "amber" : undefined },
    ]),
    emptyText: "No clock in or out recorded.",
  });

  // Tasks: the latest outcome per task per carer, as the office sees them.
  blocks.push({ kind: "heading", text: "Tasks" });
  const latest = new Map<string, RecordTask>();
  for (const t of [...v.tasks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) latest.set(`${t.personId}|${t.name}`, t);
  const taskRows = [...latest.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  blocks.push({
    kind: "table",
    columns: [{ header: "Task", width: "34%" }, { header: "Outcome", width: "36%" }, { header: "Time", width: "10%" }, { header: "Carer", width: "20%" }],
    rows: taskRows.map((t) => [
      { text: t.isKey ? `${t.name} (key)` : t.name },
      {
        text: [OUTCOME_WORDS[t.outcome], taskReasonLabel(t.reason_code, t.reason_text)].filter(Boolean).join(": "),
        rag: t.outcome === "done" ? "green" : "amber",
      },
      { text: londonTime(t.at) },
      { text: who(t.personId) },
    ]),
    emptyText: "No tasks were recorded at this visit.",
  });

  // Notes, oldest first, full width; a correction says which note it corrects, and a corrected note says so.
  blocks.push({ kind: "heading", text: "Care notes" });
  const notes = [...v.notes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const byId = new Map(notes.map((n) => [n.id, n]));
  blocks.push({
    kind: "table",
    columns: [{ header: "Time", width: "10%" }, { header: "Carer", width: "20%" }, { header: "Note", width: "70%" }],
    rows: notes.map((n) => {
      const corrects = n.correctsNoteId ? byId.get(n.correctsNoteId) : null;
      const correctedBy = notes.find((x) => x.correctsNoteId === n.id);
      const tags = [
        n.forNextCarer ? "For the next carer." : "",
        corrects ? `Correction to the ${londonTime(corrects.at)} note.` : "",
        correctedBy ? `Corrected at ${londonTime(correctedBy.at)}.` : "",
        n.flags.length ? `${flagList(n.flags)}.` : "",
      ].filter(Boolean).join(" ");
      return [
        { text: londonTime(n.at) },
        { text: n.author },
        { text: tags ? `${tags}\n${n.body}` : n.body, rag: correctedBy ? "neutral" : undefined },
      ];
    }),
    emptyText: "No note was written at this visit.",
  });

  if (v.concerns.length) {
    blocks.push({ kind: "heading", text: "Concerns raised" });
    blocks.push({
      kind: "table",
      columns: [{ header: "Time", width: "10%" }, { header: "Carer", width: "20%" }, { header: "Concern", width: "70%" }],
      rows: [...v.concerns]
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .map((c) => [{ text: londonTime(c.at) }, { text: c.author }, { text: `${c.category}.\n${c.body}`, rag: "red" as const }]),
    });
  }

  const ref = `${v.visitDate} ${v.startTime.replace(":", ".")}${v.version > 1 ? ` v${v.version}` : ""}`;
  return {
    title: "Visit record",
    kicker: "Care notes",
    subtitle: `${v.serviceUserName}${v.ssid ? ` (${v.ssid})` : ""}, ${dayWords(v.visitDate)}, ${v.startTime} to ${v.endTime}`,
    reference: ref,
    meta: [
      { label: "Company", value: v.companyName },
      { label: "Branch", value: v.branchName },
      { label: "Service", value: v.service },
      { label: "Carers", value: v.carers.map((c) => c.name).join(", ") || "None" },
      { label: "Record made", value: `${londonDate(v.madeAt)} at ${londonTime(v.madeAt)}${v.version > 1 ? `, updated version ${v.version}` : ""}` },
    ],
    blocks,
    footerNote:
      "Locations are shown as a result and a distance from the home, never a map position. Notes are never edited: a correction is a new note. This record shows everything received by the time it was made.",
  };
}

/** The file name in the day's folder: "13.30 Visit record AB" and, for a later version, ", updated 14.05". */
export function visitRecordFileName(startTime: string, initials: string, version: number, madeAt: string): string {
  const base = `${startTime.replace(":", ".")} Visit record${initials ? ` ${initials}` : ""}`;
  return version > 1 ? `${base}, updated ${londonTime(madeAt).replace(":", ".")}.pdf` : `${base}.pdf`;
}
