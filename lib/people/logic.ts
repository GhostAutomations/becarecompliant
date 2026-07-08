/**
 * Be Care Compliant — People check scheduling logic (Phase 3).
 *
 * Pure composition over the shared recurrence engine (lib/recurrence). This is the
 * ONLY place the app decides a check's initial or next due date; both the create
 * flow and the complete flow call these, so the date maths lives in one engine.
 * No side effects, safe on server and client.
 */

import {
  type Answers,
  type AnswerValue,
} from "@/lib/form-schema";
import {
  type CivilDate,
  type Rag,
  type RecurrenceRule,
  addInterval,
  formatCivilDate,
  nextDueDate,
  parseCivilDate,
  ragStatus,
  todayInLondon,
} from "@/lib/recurrence";
import type { CheckDefinition, SupervisionSlot } from "./types";

/** The recurrence rule carried by a check definition (null when not recurring/complete). */
function ruleOf(def: CheckDefinition): RecurrenceRule | null {
  if (!def.frequency || !def.interval) return null;
  return {
    frequency: def.frequency,
    interval: def.interval,
    anchor: def.anchor,
    leadDays: def.lead_days,
  };
}

/** Read an answer as an ISO date string, or null. */
function answerDate(answers: Answers, key: string | null): string | null {
  if (!key) return null;
  const v: AnswerValue | undefined = answers[key];
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

/**
 * The initial due date when a definition is first applied to a Record.
 *  - completion anchor: start date + one interval (first cycle from the start date).
 *  - expiry anchor: null (unscheduled until the first document expiry is recorded).
 * Returned as an ISO string for the RPC, or null.
 */
export function initialDueDate(def: CheckDefinition, startDate: string | null): string | null {
  if (def.anchor === "expiry") return null;
  const rule = ruleOf(def);
  if (!rule || !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const start: CivilDate = parseCivilDate(startDate);
  return formatCivilDate(addInterval(start, rule.frequency, rule.interval));
}

/**
 * The next due date (and any tracked expiry) after a check's Form is completed.
 * completedOn defaults to today in Europe/London. For expiry-anchored checks the
 * expiry is read from the form answer named by the definition's expiry_field_key.
 */
export function nextDueAfterCompletion(
  def: CheckDefinition,
  answers: Answers,
  completedOn: CivilDate = todayInLondon(),
): { nextDue: string | null; expiry: string | null } {
  const rule = ruleOf(def);
  if (!rule) return { nextDue: null, expiry: null };

  if (def.anchor === "expiry") {
    const expiryStr = answerDate(answers, def.expiry_field_key);
    if (!expiryStr) return { nextDue: null, expiry: null };
    const due = nextDueDate(rule, { expiryDate: parseCivilDate(expiryStr) });
    return { nextDue: due ? formatCivilDate(due) : null, expiry: expiryStr };
  }

  if (!def.recurring) return { nextDue: null, expiry: null };
  const due = nextDueDate(rule, { completedOn });
  return { nextDue: due ? formatCivilDate(due) : null, expiry: null };
}

/** Today's Europe/London date as an ISO string (the stamped completion date). */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
}

/** Human recurrence summary, e.g. "Every 3 months" / "Right to work expiry". */
export function recurrenceLabel(def: CheckDefinition): string {
  if (def.anchor === "expiry") return "On document expiry";
  if (!def.recurring) return "One off";
  if (!def.frequency || !def.interval) return "Not scheduled";
  const unit = def.interval === 1 ? def.frequency : `${def.frequency}s`;
  return `Every ${def.interval} ${unit}`;
}

/**
 * Derive the three Supervision slots (Sup 1/2/3) from the Supervision interval
 * (Settings) counted from the start date, plus the ordered completion history:
 * Sup N is due at start + N intervals, and its completion is the Nth supervision
 * evidence, if any. A completed slot is green; an outstanding one is RAG by its due.
 */
export function supervisionSlots(
  startDate: string | null,
  intervalDays: number | null,
  comps: Record<string, string>,
  amberDays: number,
  today: CivilDate = todayInLondon(),
  count = 3,
): SupervisionSlot[] {
  const slots: SupervisionSlot[] = [];
  const start =
    startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? parseCivilDate(startDate) : null;
  for (let n = 1; n <= count; n++) {
    const comp = comps[String(n)] ?? null;
    let due: CivilDate | null = null;
    if (start && intervalDays && intervalDays >= 1) {
      due = addInterval(start, "day", intervalDays * n);
    }
    const rag: Rag | "none" = comp ? "green" : due ? ragStatus(due, today, amberDays) : "none";
    slots.push({ n, due: due ? formatCivilDate(due) : null, comp, rag });
  }
  return slots;
}

/** RAG for a directly-recorded date treated as a due/expiry (amber before, red after). */
export function dateRag(
  date: string | null,
  amberDays: number,
  today: CivilDate = todayInLondon(),
): Rag | "none" {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "none";
  return ragStatus(parseCivilDate(date), today, amberDays);
}

/** Display a stored ISO date as "7 Jun 2026" (UK). Returns "" for null. */
export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const { year, month, day } = parseCivilDate(iso);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}
