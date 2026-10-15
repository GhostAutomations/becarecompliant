/**
 * Be Care Compliant: what the Whiteboard draws (Thistle, via Phil 2026-10-15: "Things are correct
 * on the Planner but not pulling through to the Whiteboard, and some things disappear off the
 * Whiteboard"). Pure and importless apart from its sibling date modules, so node --test runs it.
 *
 * THE RULE: every booking still planned on My Planner is on the Whiteboard. Nothing booked is ever
 * invisible.
 *
 *   - Checks are matched to a heading by their definition KEY, never their name, so renaming a
 *     check cannot drop it off. The headings, their wording and their order on screen are as they
 *     were.
 *   - A visit with several tasks shows one line under EACH task's heading (Phil's popup: "A line
 *     under each heading"), so the Spot Check column shows every spot check booked.
 *   - Anything with no heading of its own (a One to One, Audit, Mentoring, a Probation Review, an
 *     ad hoc job, a booked absence meeting) goes under "Other" on its side (Phil's popup: "Yes,
 *     both in Other").
 *   - To book: a check overdue from before this week stays, in an Overdue block in front of this
 *     week, oldest first, until it is booked or done (Phil's popup: "Overdue block first"). The
 *     date that places it is the date it is filtered on: after hospital, respite or leave, the
 *     resumed date.
 */

import { effectiveDue } from "../service-users/hospital-pause.ts";
import { boardSpan, boardWeekIndex } from "./week.ts";

export type Population = "people" | "service_users";

/** A heading on the Whiteboard: the check it gathers (by key) and the words on screen. */
export type WhiteboardHeading = { key: string; label: string };

/* The same headings, wording and order as before (2026-08 to 2026-10), now keyed. */
export const PEOPLE_LEFT: readonly WhiteboardHeading[] = [
  { key: "spot_check", label: "Spot Check" },
  { key: "supervision", label: "Supervision" },
  { key: "appraisal", label: "Annual Appraisal" },
];
export const PEOPLE_RIGHT: readonly WhiteboardHeading[] = [
  { key: "competency", label: "Medication Competency" },
  { key: "manual_handling", label: "Manual Handling" },
];
export const SU_LEFT: readonly WhiteboardHeading[] = [{ key: "setup", label: "Setup Visit" }];
export const SU_RIGHT: readonly WhiteboardHeading[] = [{ key: "care_plan_review", label: "Care Plan Review" }];

/** The section for everything with no heading of its own. */
export const OTHER = "other";
export const OTHER_LABEL = "Other";

/* THE OFFICE MATRIX (0468): a ticked person's Lead the Leader takes the place of supervision and
   sits under the Supervision heading. Only a ticked person's LTL carries a due date; one without
   goes under Other rather than nowhere. */
const LTL = "lead_the_leader";

const HEADING_KEYS: Record<Population, ReadonlySet<string>> = {
  people: new Set([...PEOPLE_LEFT, ...PEOPLE_RIGHT].map((h) => h.key)),
  service_users: new Set([...SU_LEFT, ...SU_RIGHT].map((h) => h.key)),
};

/** Which heading a task goes under: a heading key, or OTHER. */
export function headingFor(population: Population, checkKey: string | null | undefined, dueDate: string | null | undefined): string {
  const key = (checkKey ?? "").trim();
  if (!key) return OTHER;
  if (population === "people" && key === LTL) return dueDate ? "supervision" : OTHER;
  return HEADING_KEYS[population].has(key) ? key : OTHER;
}

/** Whether a check belongs on the to book strip (a check with a heading, or a dated LTL). */
export function onToBookStrip(population: Population, checkKey: string | null | undefined): boolean {
  const key = (checkKey ?? "").trim();
  if (population === "people" && key === LTL) return true;
  return HEADING_KEYS[population].has(key);
}

/** One task on a visit, as the Planner reads it. */
export type WhiteboardTask = {
  checkKey: string | null;
  label: string;
  status: "planned" | "completed" | "cancelled";
  dueDate: string | null;
};

/** One entry on the Planner: a booking (a visit), or a booked absence meeting. */
export type WhiteboardVisit = {
  id: string;
  population: Population | null;
  subjectName: string | null;
  title: string | null;
  /** What the Planner calls it (lib/planner/visit.ts visitLabel, or a meeting's chip label). */
  label: string;
  tasks: WhiteboardTask[];
  status: "planned" | "completed" | "cancelled";
  scheduledDate: string;
  startTime: string | null;
  dueDate: string | null;
  conductorId: string;
  conductorName: string | null;
  branchId: string | null;
  /** Set for an entry that is not a Planner booking (a booked absence meeting): shown, not
   *  cancelled, here, and it opens href. */
  source?: "absence_meeting";
  href?: string;
};

/** One line on the Whiteboard. A visit with several tasks has several lines, one per heading. */
export type WhiteboardLine = {
  lineId: string;
  bookingId: string;
  population: Population;
  /** A heading key, or OTHER. */
  heading: string;
  recordName: string;
  /** What it is, printed under Other where the heading cannot say. */
  what: string;
  date: string;
  startTime: string | null;
  dueDate: string | null;
  conductorId: string;
  conductorName: string | null;
  branchId: string | null;
  /** Tasks on the whole visit, so cancelling one line can say it cancels the visit. */
  taskCount: number;
  /** False for an absence meeting, which is managed on the Absence page. */
  cancellable: boolean;
  href: string | null;
};

/**
 * Every planned visit as Whiteboard lines. A task already done or called off on a visit still
 * planned is not shown (the visit is, through its other tasks). A planned visit with no open task
 * of its own (an ad hoc job, a meeting) is one line under Other, so nothing planned is lost.
 */
export function whiteboardLines(visits: ReadonlyArray<WhiteboardVisit>): WhiteboardLine[] {
  const out: WhiteboardLine[] = [];
  for (const v of visits) {
    if (v.status !== "planned") continue;
    const population: Population = v.population ?? "people";
    const title = (v.title ?? "").trim();
    const base = {
      bookingId: v.id,
      population,
      recordName: v.subjectName ?? "Unnamed",
      date: v.scheduledDate,
      startTime: v.startTime,
      conductorId: v.conductorId,
      conductorName: v.conductorName,
      branchId: v.branchId,
      taskCount: v.tasks.length,
      cancellable: v.source !== "absence_meeting",
      href: v.href ?? null,
    };
    const open = v.tasks.filter((t) => t.status === "planned");
    if (open.length === 0) {
      out.push({ ...base, lineId: `${v.id}:0`, heading: OTHER, what: v.label || title || "Task", dueDate: v.dueDate });
      continue;
    }
    open.forEach((t, i) => {
      out.push({
        ...base,
        lineId: `${v.id}:${i}`,
        heading: headingFor(population, t.checkKey, t.dueDate),
        what: title || t.label || "Task",
        dueDate: t.dueDate,
      });
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  return out;
}

/** The overdue block, in front of this week's: index -1. */
export const OVERDUE_BLOCK = -1;

/**
 * Where an unbooked check goes on the to book strip, or null when it is not on it.
 *
 * The due date that counts is the resumed one after hospital, respite or leave (when later), and
 * it is the same date that decides whether it is on the strip and which block it is in. Due
 * before this Monday: the Overdue block. Due this week or the next three: that week. Later: not
 * on the strip yet. A one off already done, or a check whose last completion already met its due
 * date, is not outstanding (lib/notifications/reportable.ts, the same rule).
 */
export function toBookPlacement(input: {
  dueDate: string | null;
  resumeDueDate: string | null;
  recurring: boolean;
  lastCompletedOn: string | null;
  todayIso: string;
}): { due: string; block: number } | null {
  if (!input.dueDate) return null;
  if (!input.recurring && input.lastCompletedOn) return null;
  if (input.lastCompletedOn && input.dueDate <= input.lastCompletedOn) return null;
  const due = effectiveDue(input.dueDate, input.resumeDueDate) ?? input.dueDate;
  const span = boardSpan(input.todayIso);
  if (!span) return null;
  if (due > span.to) return null;
  if (due < span.from) return { due, block: OVERDUE_BLOCK };
  return { due, block: boardWeekIndex(input.todayIso, due) };
}
