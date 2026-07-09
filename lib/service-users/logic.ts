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
  type RecurrenceRule,
  addInterval,
  formatCivilDate,
  parseCivilDate,
  todayInLondon,
} from "@/lib/recurrence";
import type { CheckDefinition } from "@/lib/people/types";
import type { ReviewStatus } from "./types";

// The date formatter is identical for both populations; reuse the People one so
// DD MMM YY rendering never diverges between the two registers.
export { formatDisplayDate, recurrenceLabel } from "@/lib/people/logic";

function ruleOf(def: CheckDefinition): RecurrenceRule | null {
  if (!def.frequency || !def.interval) return null;
  return {
    frequency: def.frequency,
    interval: def.interval,
    anchor: def.anchor,
    leadDays: def.lead_days,
  };
}

/**
 * The initial due date when a SU definition is first applied to a Record. Unlike
 * People (where most checks start blank), a Service User's recurring reviews are
 * scheduled from the package start date + one interval, so the register shows an
 * accurate RAG picture from day one. Expiry-anchored checks stay blank until a
 * document expiry is recorded. Returned as an ISO string for the RPC, or null.
 */
export function initialDueDate(def: CheckDefinition, packageStart: string | null): string | null {
  if (def.anchor === "expiry") return null;
  if (!def.recurring) return null;
  if (!packageStart || !/^\d{4}-\d{2}-\d{2}$/.test(packageStart)) return null;
  const rule = ruleOf(def);
  if (!rule) return null;
  return formatCivilDate(addInterval(parseCivilDate(packageStart), rule.frequency, rule.interval));
}

/** Alias used by the shared updateCheckDefinition reschedule path (People action). */
export { initialDueDate as suInitialDueDate };

/** Today's Europe/London date as an ISO string (the stamped completion date). */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
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
