/**
 * Be Care Compliant — Service User check scheduling + review logic (Phase 4).
 *
 * Pure composition over the shared recurrence engine (lib/recurrence), mirroring
 * lib/people/logic. This is the only place the app decides a Service User check's
 * initial or next due date, and where the Review Status is auto-derived. No side
 * effects, safe on server and client.
 */

import { DEFAULT_AMBER_DAYS,
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
 * package start date, the review interval (days, default 80) and the ordered list of
 * ALL Care Plan Review completions (oldest first). Positional, so it works no matter
 * how the reviews were completed: switching a branch Simple <-> Complex simply
 * reinterprets the same completions.
 *  - Review 1 due = the cycle anchor + interval; Review n (n >= 2) due = the previous
 *    review's completion + interval.
 *  - Review n completed = the n-th completion within the current cycle.
 * Completing the final review (Review `count`) restarts the cycle (like a completed
 * Annual Appraisal restarts People's supervision cycle): the cycle anchor becomes that
 * completion, all slots reset, and Review 1 becomes due one interval later. A completed
 * slot is green; an outstanding one is RAG by its due date.
 */
export function reviewSlots(
  packageStart: string | null,
  orderedComps: string[],
  intervalDays: number,
  count = 4,
  amberDays = DEFAULT_AMBER_DAYS,
  today: CivilDate = todayInLondon(),
  /**
   * WHAT WE WERE TOLD, where we were told it.
   *
   * `known.dueByComp` maps a completion date to the date it was actually due, and
   * `known.openDue` is the outstanding review's own stored due date. Both come from the
   * company's own records - an import that carried them, in practice - and both BEAT the
   * arithmetic below.
   *
   * Why they have to (Phil, 2026-09-16: "there seems to be a lot of data missing"). This
   * function used to derive every due date from the completion before it, which has two
   * consequences on imported history. Slots past the active one got NO due date at all, so
   * three of the four Due columns were blank on every row. And where a company's own next
   * review date disagreed with our interval, we showed ours: one Cardiff service user was
   * due 24 December on their board and 5 October here, and the register is the thing the
   * office works from.
   *
   * Derivation stays as the fallback, because a company that never imported has nothing
   * else, and because it is right whenever the interval was actually followed.
   */
  known: {
    dueByComp?: ReadonlyMap<string, string>;
    openDue?: string | null;
    /** Completions that arrived by IMPORT. Their deadline is knowable only if the import
     *  carried it; see dueFor for why we must not work one out instead. */
    migrated?: ReadonlySet<string>;
    /**
     * completion date -> the slot it occupied on the system it came from.
     *
     * CARBON COPY (Phil, 2026-09-17: "copy the data and disply it exactly in BCC as it is in
     * monday"). When this is known the layout below is not used at all: each review is drawn
     * in the slot it really occupied, and the outstanding one takes the slot after the most
     * recent. Our own cycle takes over the moment a review is completed in the product,
     * because that completion has no board slot.
     */
    slotByComp?: ReadonlyMap<string, number>;
  } = {},
): ReviewSlot[] {
  const slots: ReviewSlot[] = [];
  const valid = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const interval = intervalDays >= 1 ? intervalDays : 80;
  const comps = orderedComps.filter(valid).slice().sort();
  const n = comps.length;

  /*
   * CARBON COPY. Every completion knows its slot, so there is nothing to work out: slot i
   * holds the latest completion that sat in slot i, with the deadline it was given. The
   * outstanding slot is the one after the most recent completion, and it carries the stored
   * due date plus whatever it is displacing, exactly as the source board draws it.
   */
  const known2 = known.slotByComp;
  if (n > 0 && known2 && comps.every((c) => known2.has(c))) {
    const latest = comps[n - 1];
    const nextSlot = (known2.get(latest)! % count) + 1;
    for (let i = 1; i <= count; i++) {
      const inSlot = comps.filter((c) => known2.get(c) === i);
      const comp = inSlot.length > 0 ? inSlot[inSlot.length - 1] : null;
      const storedDue = comp ? known.dueByComp?.get(comp) ?? null : null;
      if (i === nextSlot) {
        const due = valid(known.openDue) ? known.openDue : null;
        slots.push({
          n: i,
          due,
          comp: null,
          prevComp: comp,
          prevLate: !!(comp && valid(storedDue) && comp > storedDue),
          rag: due ? ragStatus(parseCivilDate(due), today, amberDays) : "none",
        });
      } else {
        slots.push({
          n: i,
          due: storedDue,
          comp,
          rag: comp ? (valid(storedDue) && comp > storedDue ? "red" : "green") : "none",
        });
      }
    }
    return slots;
  }
  const addI = (d: string) => formatCivilDate(addInterval(parseCivilDate(d), "day", interval));
  /**
   * The date this completion was due: what we were told, else the interval arithmetic.
   *
   * AN IMPORTED COMPLETION IS NEVER GIVEN A DERIVED DEADLINE (Phil, 2026-09-17: "Amanda Ford
   * Monday REV1-DUE 14/06/2026 BCC Review 1 Due 04/07/24"). An import carries the last few
   * completions, not the whole history, so the completion before this one may not be the one
   * it was actually measured against - and for the oldest, the anchor falls back to the
   * package start, which for Amanda Ford is two years before the review happened. The
   * arithmetic then produced 04/07/2024 as the deadline for a review done on 26/03/2026 and
   * called it late by twenty months.
   *
   * Null is the honest answer: the board rolled that slot forward and the deadline is gone.
   * Derivation is kept for completions recorded IN the product, where the history is whole
   * and the previous completion really is the anchor.
   */
  const dueFor = (k: number): string | null => {
    const stored = known.dueByComp?.get(comps[k]);
    if (valid(stored)) return stored;
    if (known.migrated?.has(comps[k])) return null;
    const anchor = k === 0 ? packageStart : comps[k - 1];
    return valid(anchor) ? addI(anchor) : null;
  };
  // On time (green) or late (red), measured against whichever due date we just settled on.
  const lateOf = (k: number): boolean => {
    const due = dueFor(k);
    return valid(due) ? comps[k] > due : false;
  };
  // Display model (Phil, 2026-07-18): the next review to do is the active slot (after a
  // full cycle it is slot 1 again, restarting). Slots BEFORE it are this cycle's
  // completions and keep both their due and completed date. Slots AFTER it keep the
  // previous cycle's completed date as history (no due) until that slot is redone.
  const activeSlot = (n % count) + 1;
  const cycleBase = n - (n % count);
  const cycleAnchor = cycleBase > 0 ? comps[cycleBase - 1] : packageStart;
  const histIndex = (pos: number): number => {
    for (let k = n - 1; k >= 0; k--) if (k % count === pos - 1) return k;
    return -1;
  };
  for (let i = 1; i <= count; i++) {
    let comp: string | null = null;
    let prevComp: string | null = null;
    let prevLate = false;
    let due: string | null = null;
    let rag: Rag | "none" = "none";
    if (i < activeSlot) {
      const k = cycleBase + (i - 1);
      comp = comps[k] ?? null;
      if (comp) due = dueFor(k);
      else {
        const anchor = i === 1 ? cycleAnchor : comps[cycleBase + i - 2];
        due = valid(anchor) ? addI(anchor) : null;
      }
      // With no deadline there is nothing to be late against.
      rag = comp ? (lateOf(k) ? "red" : "green") : "none";
    } else if (i === activeSlot) {
      // The outstanding review's date is STORED on the check, so it is the one the whole
      // app already agrees on: the rollup, the digest and the Review Status all read it.
      if (valid(known.openDue)) due = known.openDue;
      else {
        const anchor = n > 0 ? comps[n - 1] : packageStart;
        due = valid(anchor) ? addI(anchor) : null;
      }
      rag = due ? ragStatus(parseCivilDate(due), today, amberDays) : "none";
      /* THE COMPLETION THIS SLOT IS DISPLACING (Phil, 2026-09-16: "still data missing").
         After a full cycle the active slot comes round to a position that already holds a
         completion, and that completion had nowhere to go: a service user with exactly four
         reviews showed three. It is not this slot's completion - the slot is outstanding -
         so it is carried separately and drawn as history, which is also how the board this
         copies shows it. */
      const prevK = histIndex(i);
      if (prevK >= 0 && prevK < cycleBase) {
        prevComp = comps[prevK];
        /* JUDGED ONLY WHEN WE WERE TOLD THE DEADLINE. This slot's due date has since been
           rolled forward, so deriving one would anchor on the completion before it - for
           the oldest review, the package start, which can be years back - and brand a
           punctual review late. No stored due means not late, the same rule appraisalSlot
           already uses when there is no closed cycle to judge an appraisal against. */
        const storedDue = known.dueByComp?.get(prevComp);
        prevLate = valid(storedDue) ? prevComp > storedDue : false;
      }
    } else {
      const k = histIndex(i);
      comp = k >= 0 ? comps[k] : null;
      /* A PREVIOUS CYCLE'S COMPLETION KEEPS ITS OWN DEADLINE when we were told it. It used
         to show blank here, which read as "no due date" when the truth was "we never
         looked it up". Derivation is deliberately NOT used as a fallback in this branch:
         for a slot this old the previous completion is a cycle away and the arithmetic
         would invent a deadline nobody ever worked to. */
      due = comp ? (known.dueByComp?.get(comp) ?? null) : null;
      rag = comp ? (lateOf(k) ? "red" : "green") : "none";
    }
    slots.push({ n: i, due, comp, prevComp, prevLate, rag });
  }
  return slots;
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
