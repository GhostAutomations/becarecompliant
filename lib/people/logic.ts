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
  type FormSchema,
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

  // After Supervision 3: the appraisal does NOT self-schedule. It is scheduled by the
  // NEXT Supervision 3 completion (Sup 3 + interval, see completeCheck), so on its own
  // completion there is no next due yet (blank until the next cycle reaches Sup 3).
  if (def.schedule_mode === "after_sup3") {
    return { nextDue: null, expiry: null };
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
      // probation_end_due is set at record creation and is not captured here.
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
  { key: "sup1_due", name: "Supervision 1 Due" },
  { key: "sup1_comp", name: "Supervision 1 Comp" },
  { key: "sup2_due", name: "Supervision 2 Due" },
  { key: "sup2_comp", name: "Supervision 2 Comp" },
  { key: "sup3_due", name: "Supervision 3 Due" },
  { key: "sup3_comp", name: "Supervision 3 Comp" },
  { key: "aa_due", name: "Annual Appraisal Next Due" },
  { key: "aa_comp", name: "Annual Appraisal Comp" },
  { key: "sup4_due", name: "Supervision 4 Due" },
  { key: "sup4_comp", name: "Supervision 4 Comp" },
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
 * The supervision cycle anchor: Sup 1 is due one interval after this date, and
 * only supervisions completed on/after it count towards the current cycle. It is
 * the LATER of the last Annual Appraisal completion and the successful probation
 * end, so completing an appraisal restarts the annual supervision cycle. Returns
 * an ISO date or null (no probation end and no appraisal yet). ISO strings sort
 * lexicographically, so the max is the last element after sorting.
 */
export function supervisionCycleAnchor(
  appraisalCompletedOn: string | null | undefined,
  probationEndActual: string | null | undefined,
): string | null {
  const dates = [appraisalCompletedOn, probationEndActual].filter(
    (d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
  if (dates.length === 0) return null;
  return dates.sort()[dates.length - 1];
}

/**
 * Derive the three Supervision slots (Sup 1/2/3) for the CURRENT cycle from the
 * Supervision interval (Settings), the appraisal/probation dates and the history:
 *  - Sup 1 is due the interval after the LATER of the last appraisal completion and
 *    the successful probation end; no due until one of those exists.
 *  - Sup N (N >= 2) is due the interval after the previous supervision was completed.
 *  - Only a completed Annual Appraisal restarts the cycle: completions on/before the
 *    last appraisal are dropped, so Sup 1/2/3 reset. The probation end only sets
 *    year-one's Sup 1 due; it never hides supervisions dated before it.
 * A completed slot is green; an outstanding one is RAG by its due.
 */
export function supervisionSlots(
  intervalDays: number | null,
  compDates: string[],
  amberDays: number,
  appraisalCompDates: string[] = [],
  probationEndActual: string | null = null,
  today: CivilDate = todayInLondon(),
  count = 3,
  mode: "appraisal" | "four_supervisions" = "appraisal",
): SupervisionSlot[] {
  const slots: SupervisionSlot[] = [];
  const valid = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const hasInterval = !!intervalDays && intervalDays >= 1;
  const addI = (d: string) => formatCivilDate(addInterval(parseCivilDate(d), "day", intervalDays!));
  const all = compDates.filter(valid).slice().sort();
  // What closes and restarts a cycle:
  //  - appraisal mode: a completed Annual Appraisal (each ends a cycle of `count`).
  //    Sup 1 anchors on the LATER of the last appraisal completion and the probation end.
  //  - four_supervisions mode: no appraisal; every `count` completed supervisions closes
  //    a cycle, and the last supervision of the previous cycle anchors the next Sup 1.
  let consumed: number;
  let dueAnchor: string | null;
  if (mode === "four_supervisions") {
    consumed = count * Math.floor(all.length / count);
    dueAnchor = consumed > 0 ? all[consumed - 1] : (valid(probationEndActual) ? probationEndActual : null);
  } else {
    const appraisals = appraisalCompDates.filter(valid).slice().sort();
    const appraisalCount = appraisals.length;
    const lastAppraisal = appraisalCount > 0 ? appraisals[appraisalCount - 1] : null;
    dueAnchor = supervisionCycleAnchor(lastAppraisal, probationEndActual);
    consumed = count * appraisalCount;
  }
  const cycle = all.slice(consumed);
  const prev = all.slice(Math.max(0, consumed - count), consumed);
  // Display model (Phil, 2026-07-18): the active slot is the next supervision to do (after
  // an appraisal it is Sup 1 again). Slots before it keep both due and completed date;
  // slots after it keep the previous cycle's completed date (no due) until redone.
  const activeSlot = cycle.length + 1;
  for (let i = 1; i <= count; i++) {
    let comp: string | null = null;
    let due: string | null = null;
    let rag: Rag | "none" = "none";
    if (i < activeSlot) {
      comp = cycle[i - 1] ?? null;
      const anchor = i === 1 ? dueAnchor : cycle[i - 2];
      due = hasInterval && valid(anchor) ? addI(anchor) : null;
      rag = comp ? (due && comp > due ? "red" : "green") : "none";
    } else if (i === activeSlot) {
      const anchor = cycle.length > 0 ? cycle[cycle.length - 1] : dueAnchor;
      due = hasInterval && valid(anchor) ? addI(anchor) : null;
      rag = due ? ragStatus(parseCivilDate(due), today, amberDays) : "none";
    } else {
      comp = prev[i - 1] ?? null;
      const anchor = i > 1 ? prev[i - 2] : null;
      const hd = hasInterval && valid(anchor) ? addI(anchor) : null;
      rag = comp ? (hd && comp > hd ? "red" : "green") : "none";
    }
    slots.push({ n: i, due, comp, rag });
  }
  return slots;
}

export type AppraisalSlot = {
  /** When the NEXT appraisal is due: the current cycle's Sup 3 completion + interval,
   *  or null until three supervisions are done in the current cycle. */
  nextDue: string | null;
  nextDueRag: Rag | "none";
  /** The last completed appraisal date, or null. */
  comp: string | null;
  /** Pill for the completed appraisal: green if it was done on/before the due it was
   *  set against (the supervision that triggered it + interval), red if late. */
  compRag: Rag | "none";
};

/**
 * The appraisal cycle slot (Phil, 2026-07-18): the appraisal is scheduled off the
 * supervision cycle (due after Sup 3), so its next due comes from the current cycle's
 * third supervision, and the completed appraisal is coloured on time (green) or late
 * (red) against the supervision that triggered it.
 */
export function appraisalSlot(
  appraisalCompDates: string[],
  supCompDates: string[],
  intervalDays: number | null,
  amberDays: number,
  today: CivilDate = todayInLondon(),
): AppraisalSlot {
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const hasInterval = !!intervalDays && intervalDays >= 1;
  const addI = (d: string) => formatCivilDate(addInterval(parseCivilDate(d), "day", intervalDays!));
  const appraisals = appraisalCompDates.filter(isDate).slice().sort();
  const appraisalCount = appraisals.length;
  const comp = appraisalCount > 0 ? appraisals[appraisalCount - 1] : null;
  const sups = supCompDates.filter(isDate).slice().sort();
  // Each appraisal closes a cycle of three supervisions (count-based, like the reviews).
  const consumed = 3 * appraisalCount;

  // Lateness of the last appraisal: judged against the third supervision of the cycle
  // it closed (that supervision + interval).
  let compRag: Rag | "none" = "none";
  if (comp) {
    const closedThirdSup = sups[consumed - 1] ?? null;
    if (hasInterval && closedThirdSup) {
      compRag = comp > addI(closedThirdSup) ? "red" : "green";
    } else {
      compRag = "green"; // no completed cycle to judge lateness against
    }
  }

  // Next appraisal due once three supervisions are done in the CURRENT (open) cycle.
  let nextDue: string | null = null;
  let nextDueRag: Rag | "none" = "none";
  const currentCycleSups = sups.slice(consumed);
  if (hasInterval && currentCycleSups.length >= 3) {
    nextDue = addI(currentCycleSups[2]);
    nextDueRag = ragStatus(parseCivilDate(nextDue), today, amberDays);
  }

  return { nextDue, nextDueRag, comp, compRag };
}

/**
 * Annotate the supervision form's "Which supervision" options with this person's
 * current-cycle due/completion dates, and flag the next one to complete, so the
 * person filling in the form knows which supervision is next. Pure: returns a new
 * schema, leaving the stored form untouched. Only touches the supervision_type
 * single_select; every other field is returned as-is.
 */
export function annotateSupervisionOptions(
  schema: FormSchema,
  slots: SupervisionSlot[],
): FormSchema {
  const nextN = slots.find((s) => !s.comp)?.n ?? null;
  const hintFor = (slot: SupervisionSlot): string | undefined => {
    let hint: string;
    if (slot.comp) hint = `completed ${formatDisplayDate(slot.comp)}`;
    else if (slot.due) hint = `due ${formatDisplayDate(slot.due)}`;
    else if (slot.n > 1) hint = `due after Supervision ${slot.n - 1}`;
    else hint = "";
    if (slot.n === nextN) hint = hint ? `${hint} (next)` : "next";
    return hint || undefined;
  };
  const bySlot = new Map(slots.map((s) => [String(s.n), s]));
  return {
    ...schema,
    sections: schema.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (field.key !== "supervision_type" || !field.options) return field;
        const existing = field.options.map((o) => {
          const slot = bySlot.get(o.value);
          return slot ? { ...o, hint: hintFor(slot) } : o;
        });
        // Add any cycle slot (e.g. Supervision 4 in four-supervisions mode) the stored
        // form does not already offer, so the whole cycle is selectable.
        const existingValues = new Set(field.options.map((o) => o.value));
        const extra = slots
          .filter((s) => !existingValues.has(String(s.n)))
          .map((s) => ({ label: `Supervision ${s.n}`, value: String(s.n), hint: hintFor(s) }));
        return { ...field, options: [...existing, ...extra] };
      }),
    })),
  };
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
