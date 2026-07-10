/**
 * Be Care Compliant — Service User check scheduling + review logic (Phase 4).
 *
 * Pure composition over the shared recurrence engine (lib/recurrence), mirroring
 * lib/people/logic. This is the only place the app decides a Service User check's
 * initial or next due date, and where the Review Status is auto-derived. No side
 * effects, safe on server and client.
 */

import {
  type CivilDate,
  type Rag,
  type RecurrenceRule,
  addInterval,
  formatCivilDate,
  parseCivilDate,
  ragStatus,
  todayInLondon,
} from "@/lib/recurrence";
import type { CheckDefinition } from "@/lib/people/types";
import type { FormSchema } from "@/lib/form-schema";
import type { ReviewSlot, ReviewStatus } from "./types";
// The date formatter is identical for both populations; reuse the People one so
// DD MMM YY rendering never diverges between the two registers. Imported for local
// use here and re-exported for callers.
import { formatDisplayDate, recurrenceLabel } from "@/lib/people/logic";

export { formatDisplayDate, recurrenceLabel };

function ruleOf(def: CheckDefinition): RecurrenceRule | null {
  if (!def.frequency || !def.interval) return null;
  return {
    frequency: def.frequency,
    interval: def.interval,
    anchor: def.anchor,
    leadDays: def.lead_days,
  };
}

/** Add a signed number of days to an ISO date (UTC-safe), for offsets the recurrence
 *  engine rejects (it only accepts positive intervals). Used for the Setup check,
 *  which is due a configurable number of days relative to the package start (default
 *  -1 = the day before). Returns an ISO string. */
function addSignedDaysIso(iso: string, days: number): string {
  const { year, month, day } = parseCivilDate(iso);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/**
 * The initial due date when a SU definition is first applied to a Record. Unlike
 * People (where most checks start blank), a Service User's recurring reviews are
 * scheduled from the package start date + one interval, so the register shows an
 * accurate RAG picture from day one. The one-off Setup check schedules relative to
 * the package start by its day offset (which may be negative, e.g. -1 = the day
 * before). Expiry-anchored checks stay blank until a document expiry is recorded.
 * Returned as an ISO string for the RPC, or null.
 */
export function initialDueDate(def: CheckDefinition, packageStart: string | null): string | null {
  if (def.anchor === "expiry") return null;
  if (!packageStart || !/^\d{4}-\d{2}-\d{2}$/.test(packageStart)) return null;
  if (def.frequency == null || def.interval == null) return null;
  if (def.recurring) {
    const rule = ruleOf(def);
    if (!rule) return null;
    return formatCivilDate(addInterval(parseCivilDate(packageStart), rule.frequency, rule.interval));
  }
  // Non-recurring completion-anchored checks (Setup): schedule package start + the
  // day offset, allowing a negative offset the recurrence engine would reject.
  if (def.frequency === "day") return addSignedDaysIso(packageStart, def.interval);
  return null;
}

/** Alias used by the shared updateCheckDefinition reschedule path (People action). */
export { initialDueDate as suInitialDueDate };

/** Today's Europe/London date as an ISO string (the stamped completion date). */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
}

/** Add a positive number of days to an ISO date (e.g. the Complex review cadence). */
export function addDaysToIso(iso: string | null, days: number): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || days < 1) return null;
  return formatCivilDate(addInterval(parseCivilDate(iso), "day", days));
}

/**
 * Derive the four Care Plan Review slots (Review 1-4) for a Complex branch from the
 * package start date, the review interval (days, default 80) and the completion
 * history, keyed by review number (like People's Supervision 1/2/3):
 *  - Review 1 due = package start + interval.
 *  - Review n (n >= 2) due = the previous review's completion + interval.
 *  - Review n completed = the completion whose "which review" answer is n.
 * A completed slot is green; an outstanding one is RAG by its due date.
 */
export function reviewSlots(
  packageStart: string | null,
  comps: Record<string, string>,
  intervalDays: number,
  count = 4,
  amberDays = 30,
  today: CivilDate = todayInLondon(),
): ReviewSlot[] {
  const slots: ReviewSlot[] = [];
  const valid = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const interval = intervalDays >= 1 ? intervalDays : 80;
  const compOf = (n: number): string | null => (valid(comps[String(n)]) ? comps[String(n)] : null);
  for (let n = 1; n <= count; n++) {
    const comp = compOf(n);
    const anchor = n === 1 ? packageStart : compOf(n - 1);
    const due = valid(anchor) ? formatCivilDate(addInterval(parseCivilDate(anchor), "day", interval)) : null;
    const rag: Rag | "none" = comp ? "green" : due ? ragStatus(parseCivilDate(due), today, amberDays) : "none";
    slots.push({ n, due, comp, rag });
  }
  return slots;
}

/** Annotate the Care Plan Review form's "Which review" options with this Service
 *  User's slot due/completion dates, and flag the next one to complete, so the person
 *  filling the form knows which review is next. Pure: returns a new schema. */
export function annotateReviewOptions(schema: FormSchema, slots: ReviewSlot[]): FormSchema {
  const nextN = slots.find((s) => !s.comp)?.n ?? null;
  const bySlot = new Map(slots.map((s) => [String(s.n), s]));
  return {
    ...schema,
    sections: schema.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (field.key !== "review_number" || !field.options) return field;
        return {
          ...field,
          options: field.options.map((o) => {
            const slot = bySlot.get(o.value);
            if (!slot) return o;
            let hint: string;
            if (slot.comp) hint = `completed ${formatDisplayDate(slot.comp)}`;
            else if (slot.due) hint = `due ${formatDisplayDate(slot.due)}`;
            else if (slot.n > 1) hint = `due after Review ${slot.n - 1}`;
            else hint = "";
            if (slot.n === nextN) hint = hint ? `${hint} (next)` : "next";
            return { ...o, hint: hint || undefined };
          }),
        };
      }),
    })),
  };
}

/**
 * The Review Status shown in the register, AUTO-DERIVED (never set by hand):
 *  - Overdue when the New Review Due date has passed (today in Europe/London).
 *  - Booked In when a Planned Review Date is set and the review is not overdue.
 *  - Awaiting Review otherwise.
 * newReviewDue is the Care Plan Review check's due date; plannedReviewDate is the
 * booked date held on the tracker.
 */
export function reviewStatus(
  newReviewDue: string | null,
  plannedReviewDate: string | null,
  today: CivilDate = todayInLondon(),
): ReviewStatus {
  const todayIsoStr = formatCivilDate(today);
  const overdue = !!newReviewDue && /^\d{4}-\d{2}-\d{2}$/.test(newReviewDue) && newReviewDue < todayIsoStr;
  if (overdue) return "overdue";
  if (plannedReviewDate && /^\d{4}-\d{2}-\d{2}$/.test(plannedReviewDate)) return "booked";
  return "awaiting";
}
