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
/**
 * Which checks get a due date auto-filled when a carer is added. Everything else
 * (supervision, appraisal, manual handling, medication competency) starts blank and
 * is scheduled through completion or manually. Spot Check is dated from the start.
 */
const AUTO_SCHEDULE_ON_ADD = new Set(["spot_check"]);

export function initialDueDate(def: CheckDefinition, startDate: string | null): string | null {
  if (!AUTO_SCHEDULE_ON_ADD.has(def.key)) return null;
  if (def.anchor === "expiry") return null;
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const rule = ruleOf(def);
  if (!rule) return null;
  return formatCivilDate(addInterval(parseCivilDate(startDate), rule.frequency, rule.interval));
}

/** start date + N days as an ISO string (used for the probation end due date). */
export function addDaysIso(startDate: string | null, days: number | null): string | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !days || days < 1) return null;
  return formatCivilDate(addInterval(parseCivilDate(startDate), "day", days));
}

/**
 * The next due date (and any tracked expiry) after a check's Form is completed.
 * completedOn defaults to today in Europe/London. For expiry-anchored checks the
 * expiry is read from the form answer named by the definition's expiry_field_key.
 */
export function nextDueAfterCompletion(
  def: CheckDefinition,
  answers: Answers,
  supIntervalDays?: number | null,
  completedOn: CivilDate = todayInLondon(),
): { nextDue: string | null; expiry: string | null } {
  if (def.anchor === "expiry") {
    const expiryStr = answerDate(answers, def.expiry_field_key);
    if (!expiryStr) return { nextDue: null, expiry: null };
    const rule = ruleOf(def);
    const due = rule ? nextDueDate(rule, { expiryDate: parseCivilDate(expiryStr) }) : null;
    return { nextDue: due ? formatCivilDate(due) : null, expiry: expiryStr };
  }

  if (!def.recurring) return { nextDue: null, expiry: null };

  // After Supervision 3: recur every 3 supervision periods (from the Supervision box).
  if (def.schedule_mode === "after_sup3" && supIntervalDays && supIntervalDays >= 1) {
    return {
      nextDue: formatCivilDate(addInterval(completedOn, "day", supIntervalDays * 3)),
      expiry: null,
    };
  }

  const rule = ruleOf(def);
  if (!rule) return { nextDue: null, expiry: null };
  const due = nextDueDate(rule, { completedOn });
  return { nextDue: due ? formatCivilDate(due) : null, expiry: null };
}

/**
 * The document/tracker cards whose dates are fed by completing a form. Maps each
 * form key to the tracker date columns its answers populate, plus (optionally) a
 * status column set from an answer. Used by completeTrackerForm and the record UI.
 */
export const TRACKER_FORMS: Record<
  string,
  {
    title: string;
    /** form answer key -> person_trackers date column */
    dateFields: Record<string, string>;
    /** optionally set a status column from an answer (values already match the enum) */
    statusFrom?: { answer: string; column: string };
  }
> = {
  dbs_renewal: {
    title: "DBS",
    dateFields: { dbs_date: "dbs_date", enhanced_dbs_date: "enhanced_dbs_date" },
  },
  right_to_work: {
    title: "Right to Work",
    dateFields: { rtw_expiry: "rtw_expiry_date" },
  },
  probation_review: {
    title: "Probation",
    dateFields: {
      probation_end_due: "probation_end_due",
      probation_end_actual: "probation_end_actual",
      probation_extension_date: "probation_extension_date",
    },
    statusFrom: { answer: "outcome", column: "probation_status" },
  },
};

/**
 * The People register columns that can be given a shorthand label in Settings.
 * key is stable (used in the labels map + the register headers); name is the full
 * default label. The sticky Carer column is intentionally excluded.
 */
export const REGISTER_COLUMNS: Array<{ key: string; name: string }> = [
  { key: "status", name: "Status" },
  { key: "start_date", name: "Start date" },
  { key: "manual_handling", name: "Manual Handling" },
  { key: "medication_competency", name: "Medication Competency" },
  { key: "dbs", name: "DBS" },
  { key: "enhanced_dbs", name: "Enhanced DBS" },
  { key: "rtw_expiry", name: "RTW Expiry" },
  { key: "rtw_limits", name: "RTW Limits" },
  { key: "probation_end_due", name: "Probation End Due" },
  { key: "probation_end_actual", name: "Probation End Actual" },
  { key: "probation_status", name: "Probation Status" },
  { key: "probation_extension", name: "Probation Extension" },
  { key: "spot_check_due", name: "Spot Check Due" },
  { key: "recent_spot_check", name: "Recent Spot Check" },
  { key: "sup1_due", name: "Sup 1 Due" },
  { key: "sup1_comp", name: "Sup 1 Comp" },
  { key: "sup2_due", name: "Sup 2 Due" },
  { key: "sup2_comp", name: "Sup 2 Comp" },
  { key: "sup3_due", name: "Sup 3 Due" },
  { key: "sup3_comp", name: "Sup 3 Comp" },
  { key: "aa_due", name: "AA Next Due" },
  { key: "aa_comp", name: "AA Comp" },
];

/** Today's Europe/London date as an ISO string (the stamped completion date). */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
}

/** Human recurrence summary, e.g. "Every 3 months" / "Right to work expiry". */
export function recurrenceLabel(def: CheckDefinition): string {
  if (def.anchor === "expiry") return "On document expiry";
  if (!def.recurring) return "One off";
  if (def.schedule_mode === "after_sup3") return "After Supervision 3";
  if (!def.frequency || !def.interval) return "Not scheduled";
  const unit = def.interval === 1 ? def.frequency : `${def.frequency}s`;
  return `Every ${def.interval} ${unit}`;
}

/**
 * Derive the three Supervision slots (Sup 1/2/3) from the Supervision interval
 * (Settings) plus the ordered completion history:
 *  - Sup 1 is due the interval after the successful probation end (actual if set,
 *    else the planned end due date); it has no due until a probation end exists.
 *  - Sup N (N >= 2) is due the interval after the previous supervision was completed.
 * A completed slot is green; an outstanding one is RAG by its due.
 */
export function supervisionSlots(
  intervalDays: number | null,
  comps: Record<string, string>,
  amberDays: number,
  probationEnd: string | null = null,
  today: CivilDate = todayInLondon(),
  count = 3,
): SupervisionSlot[] {
  const slots: SupervisionSlot[] = [];
  const hasInterval = !!intervalDays && intervalDays >= 1;
  for (let n = 1; n <= count; n++) {
    const comp = comps[String(n)] ?? null;
    let due: CivilDate | null = null;
    if (hasInterval) {
      // Sup 1 anchors on the probation end; Sup N on the previous completion.
      const anchor = n === 1 ? probationEnd : comps[String(n - 1)];
      if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
        due = addInterval(parseCivilDate(anchor), "day", intervalDays!);
      }
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

/** Display a stored ISO date as "15 Jan 26" (DD MMM YY). Returns "" for null. */
export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const { year, month, day } = parseCivilDate(iso);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dd = String(day).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${dd} ${months[month - 1]} ${yy}`;
}
