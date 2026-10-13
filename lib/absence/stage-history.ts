/**
 * Be Care Compliant — absence stages worked out at the date of each absence (Phil, 2026-10-13,
 * Thistle ticket raised for one of their carers). Pure and importless apart from the window maths,
 * so node --test runs it directly.
 *
 * WHY. The old count (person_absence_summary) measures the rolling window back from TODAY, so an
 * absence that reached Stage 1 in August is "Outside the window" by October and the stage it
 * reached quietly disappears, even when its meeting is booked and not yet held. Here the window
 * is measured back from each absence instead, and every stage reached stays on the record with
 * its own status until it is dealt with.
 *
 * THE RULES (Phil's popups, 2026-10-13; docs/decisions/absence-stage-history.md):
 *   - Discounted absences never count. Multi day absences count when any day of them is inside
 *     the window (one starting before the window and ending inside it counts); one starting
 *     exactly on the window's first day counts.
 *   - A stage is reached on the date of the absence that brings the count inside the window
 *     (measured back from that absence) up to the stage's trigger. The count alone decides: the
 *     7 October "new absence after a meeting" rule does not apply here.
 *   - Each stage has one status: Due (reached, no meeting booked), Pending (meeting booked, not
 *     held), Dealt with (a meeting at THAT stage held on or after the date it was reached). A
 *     higher stage meeting does not deal with a lower stage, and there is no closing a stage
 *     without a meeting.
 *   - A stage never expires because time passes, and a higher stage never hides a lower one.
 *   - Once dealt with, the same stage is reached again only after the count has fallen below its
 *     trigger and climbs back to it. While a stage is still open it is not reached a second time.
 *   - A declined booking is not a booking (the same as the old count): the stage stays Due.
 *   - A meeting marked as dealing with a stage reached later (absence_meetings.deals_with_later,
 *     0458; Phil, 2026-10-13, for a Thistle carer whose Stage 1 meeting was held before her third
 *     absence) counts even though it came first, but only inside the rolling window that reached
 *     the stage. A meeting on or after the date is always preferred.
 *
 * Only for the trigger point method. Bradford companies keep the old count.
 */

import { windowStartIso, type WindowLike } from "./discount.ts";

export type HistoryEvent = {
  id: string;
  start_date: string;
  end_date: string | null;
  discounted_at: string | null;
};

export type HistoryMeeting = {
  id: string;
  stage: number | null;
  meeting_date: string | null;
  /** Recorded (has Evidence). */
  held: boolean;
  /** The employee declined the invitation. */
  declined?: boolean | null;
  /** Marked as dealing with the stage even though held before it was reached (0458). */
  dealsWithLater?: boolean | null;
};

export type StageTrigger = { stage: number; occasions: number };

export type StageState = "due" | "pending" | "dealt_with";

export type ReachedStage = {
  stage: number;
  /** The date of the absence that reached it. */
  reachedOn: string;
  /** That absence. */
  reachedBy: string;
  /** The absences inside the window on that date, oldest first: what reached it. */
  counted: string[];
  state: StageState;
  /** The meeting held (dealt with) or booked (pending), if any. */
  meetingId: string | null;
  meetingDate: string | null;
};

export type StageHistory = {
  /** Every time a stage was reached, oldest first. */
  reached: ReachedStage[];
  /** The latest time each stage was reached, lowest stage first. */
  current: ReachedStage[];
  /** The current stages still to be dealt with (Due or Pending), lowest stage first. */
  open: ReachedStage[];
  /** Absences counting towards a Due or Pending stage: the bracket in the popup. */
  bracketed: string[];
  /** Absence id to the stages it reached (current ones only), for the milestone pills. */
  milestones: Record<string, number[]>;
  /** Absences that count inside the window measured back from today. */
  countingToday: string[];
};

const lastDay = (e: { start_date: string; end_date: string | null }) =>
  e.end_date && e.end_date > e.start_date ? e.end_date : e.start_date;

/** The counted absences in order, and how many were inside the window at each one's date. */
export function countsAtEachAbsence(
  events: HistoryEvent[],
  window: WindowLike,
): Array<{ event: HistoryEvent; inWindow: HistoryEvent[] }> {
  const counted = events
    .filter((e) => !e.discounted_at)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || lastDay(a).localeCompare(lastDay(b)) || a.id.localeCompare(b.id));
  return counted.map((event, i) => {
    const from = windowStartIso(event.start_date, window);
    const inWindow = counted.slice(0, i + 1).filter((e) => lastDay(e) >= from);
    return { event, inWindow };
  });
}

export function stageHistory(input: {
  events: HistoryEvent[];
  meetings: HistoryMeeting[];
  triggers: StageTrigger[];
  window: WindowLike;
  todayIso: string;
}): StageHistory {
  const steps = countsAtEachAbsence(input.events, input.window);
  const triggers = [...input.triggers]
    .filter((t) => Number.isFinite(t.occasions) && t.occasions > 0)
    .sort((a, b) => a.stage - b.stage);
  const meetings = [...input.meetings]
    .filter((m) => m.stage != null)
    .sort((a, b) => (a.meeting_date ?? "9999").localeCompare(b.meeting_date ?? "9999") || a.id.localeCompare(b.id));

  const reached: ReachedStage[] = [];
  const current: ReachedStage[] = [];

  for (const t of triggers) {
    const used = new Set<string>();
    const held = meetings.filter((m) => m.stage === t.stage && m.held && m.meeting_date);
    const dealtBy = (from: string) =>
      held.find((m) => !used.has(m.id) && (m.meeting_date as string) >= from) ??
      held.find(
        (m) =>
          !used.has(m.id) &&
          !!m.dealsWithLater &&
          (m.meeting_date as string) < from &&
          (m.meeting_date as string) >= windowStartIso(from, input.window),
      ) ??
      null;

    let above = false;
    let last: ReachedStage | null = null;
    for (const step of steps) {
      const nowAbove = step.inWindow.length >= t.occasions;
      if (nowAbove && !above) {
        // Still open from last time: the same stage is not reached twice.
        const openStill =
          last &&
          (last.state !== "dealt_with" ||
            ((last.meetingDate as string) > step.event.start_date && (last.meetingDate as string) >= last.reachedOn));
        if (!openStill) {
          const m = dealtBy(step.event.start_date);
          if (m) used.add(m.id);
          last = {
            stage: t.stage,
            reachedOn: step.event.start_date,
            reachedBy: step.event.id,
            counted: step.inWindow.map((e) => e.id),
            state: m ? "dealt_with" : "due",
            meetingId: m?.id ?? null,
            meetingDate: m?.meeting_date ?? null,
          };
          reached.push(last);
        }
      }
      above = nowAbove;
    }

    if (last && last.state === "due") {
      const booked = meetings.find((m) => m.stage === t.stage && !m.held && !m.declined);
      if (booked) {
        last.state = "pending";
        last.meetingId = booked.id;
        last.meetingDate = booked.meeting_date;
      }
    }
    if (last) current.push(last);
  }

  reached.sort((a, b) => a.reachedOn.localeCompare(b.reachedOn) || a.stage - b.stage);
  const open = current.filter((r) => r.state !== "dealt_with");
  const bracketed = new Set<string>();
  for (const r of open) for (const id of r.counted) bracketed.add(id);
  const milestones: Record<string, number[]> = {};
  for (const r of current) (milestones[r.reachedBy] ??= []).push(r.stage);

  const from = windowStartIso(input.todayIso, input.window);
  const countingToday = input.events
    .filter((e) => !e.discounted_at && lastDay(e) >= from && e.start_date <= input.todayIso)
    .map((e) => e.id);

  return {
    reached,
    current,
    open,
    bracketed: [...bracketed],
    milestones,
    countingToday,
  };
}

/** The one status pill each absence card carries in the popup. */
export type AbsenceCardStatus =
  | { kind: "discounted" }
  | { kind: "milestone"; stages: number[] }
  | { kind: "counts" }
  | { kind: "outside_window" };

export function absenceCardStatus(eventId: string, discounted: boolean, history: StageHistory): AbsenceCardStatus {
  if (discounted) return { kind: "discounted" };
  const stages = history.milestones[eventId];
  if (stages?.length) return { kind: "milestone", stages };
  if (history.bracketed.includes(eventId) || history.countingToday.includes(eventId)) return { kind: "counts" };
  return { kind: "outside_window" };
}

/** The stages a meeting can be booked or recorded at: the Due ones, lowest first (Phil: "Booking
 *  defaults to the lowest Due stage, and the manager can change it"). With nothing Due, the stage
 *  after the highest one reached or held, so a meeting can still be held early, as before
 *  (record-meeting.ts availableStages). Never a stage already booked. */
export function bookableStages(history: StageHistory, heldStages: number[], maxStage = 4): number[] {
  const due = history.current.filter((r) => r.state === "due").map((r) => r.stage);
  if (due.length > 0) return due;
  const pending = new Set(history.current.filter((r) => r.state === "pending").map((r) => r.stage));
  const top = Math.max(0, ...history.current.map((r) => r.stage), ...heldStages);
  const next = top + 1;
  return next <= maxStage && !pending.has(next) ? [next] : [];
}

/** "Stage 1 Pending · Stage 2 Due": every open stage, compactly, for the cards and tiles. */
export function openStagesLine(history: StageHistory): string {
  return history.open
    .map((r) => `Stage ${r.stage} ${r.state === "pending" ? "Pending" : "Due"}`)
    .join(" · ");
}

/**
 * The absences a stage's meeting is about, with the switch on: the ones inside the window when
 * that stage was last reached, oldest first, so the meeting form, the invitation and the outcome
 * letter can take that stage's own slice of them (meeting-questions.ts discussedAbsences). Null
 * when the stage has not been reached (a meeting held early), and the caller keeps today's list.
 */
export function stageAbsenceIds(history: StageHistory, stage: number | null | undefined): string[] | null {
  if (!stage) return null;
  const hit = [...history.reached].reverse().find((r) => r.stage === stage);
  return hit ? hit.counted : null;
}
