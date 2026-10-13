/**
 * Be Care Compliant — Absence tracking logic (pure, testable).
 *
 * Mirrors the recurrence-engine split: SQL (person_absence_summary) computes the
 * raw aggregates over the company's rolling window; ALL policy mapping (which
 * stage or Bradford score a person is on, and whether a meeting is due) lives
 * here in one place so it can be unit-tested and reused by the register view,
 * the record drill-down and reports.
 *
 * Nothing here talks to the database or React. Keep it dependency-free.
 */

/* Relative and extensioned, so node --test can load this file (logic.test.ts). */
import { type AbsenceWindow, absenceWindowFrom } from "./window.ts";
import { stageDueAfterNewAbsence } from "./next-stage.ts";
import { availableStages } from "./record-meeting.ts";
import {
  bookableStages,
  stageHistory,
  type HistoryEvent,
  type HistoryMeeting,
  type StageHistory,
} from "./stage-history.ts";

export type AbsenceMethod = "stages" | "bradford";

/** Trigger-point stage: fires when the number of occasions crosses the threshold. */
export type StageThreshold = {
  stage: number; // 1..4
  label: string;
  occasions?: number; // e.g. 3 separate absences
  /** What the stage can lead to, from the fixed list in lib/absence/stage-actions.ts
   *  (Phil, 2026-09-29). Optional: a company that has not set one keeps working. */
  action?: string;
};

/** Bradford action band: fires when the score reaches the threshold. */
export type BradfordBand = {
  threshold: number; // Bradford score
  label: string; // e.g. "Stage 1"
  action: string; // e.g. "Informal discussion"
};

export type AbsenceConfig = {
  method: AbsenceMethod;
  /** The rolling window in the words of the policy: 12 months, 52 weeks, 365 days. */
  window: AbsenceWindow;
  /** StageThreshold[] when method='stages', BradfordBand[] when 'bradford'. */
  thresholds: StageThreshold[] | BradfordBand[];
};

/** Raw per-person aggregate from person_absence_summary. */
export type AbsenceAggregate = {
  occasions: number;
  totalDays: number;
  /** Highest stage a formal meeting has recorded, if any. */
  latestMeetingStage: number | null;
  /** Counted absences that began after the last recorded meeting (0420). */
  absencesSinceMeeting?: number;
  /** 0429: the stage of the latest meeting actually held (stage_after when set). */
  heldMeetingStage?: number | null;
  /** 0429: the highest stage actually held, for the card's "last meeting" box. */
  lastHeldStage?: number | null;
  /** 0429: absences that still count, dated on or before that latest held meeting. */
  countedAtMeeting?: number | null;
  /** 0429: absences discounted, dated on or before that meeting. */
  discountedAtMeeting?: number | null;
  /** 0429: the warning recorded at that meeting ("None" or blank when none was given). */
  heldMeetingWarning?: string | null;
  /** 0433: that meeting's stage after was decided when it was recorded, so it is trusted as it is. */
  heldStageAfterSet?: boolean;
};

/** The person_absence_summary columns every stage decision reads (0429). One list, so the screens
 *  and the server checks can never read different things. */
export const SUMMARY_STAGE_COLUMNS =
  "occasions, total_days, latest_meeting_stage, absences_since_meeting, held_meeting_stage, last_held_stage, counted_at_meeting, discounted_at_meeting, held_meeting_warning, held_meeting_stage_after_set";

/** A person_absence_summary row (or none) as the aggregate deriveAbsenceStatus takes. */
export function aggregateFromSummary(row: Record<string, unknown> | null | undefined): AbsenceAggregate {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    occasions: n(row?.occasions) ?? 0,
    totalDays: n(row?.total_days) ?? 0,
    latestMeetingStage: n(row?.latest_meeting_stage),
    absencesSinceMeeting: n(row?.absences_since_meeting) ?? 0,
    heldMeetingStage: n(row?.held_meeting_stage),
    lastHeldStage: n(row?.last_held_stage),
    countedAtMeeting: n(row?.counted_at_meeting),
    discountedAtMeeting: n(row?.discounted_at_meeting),
    heldMeetingWarning: typeof row?.held_meeting_warning === "string" ? (row.held_meeting_warning as string) : null,
    heldStageAfterSet: row?.held_meeting_stage_after_set === true,
  };
}

/** What the Absence view shows on a person's card. */
export type AbsenceStatus = {
  method: AbsenceMethod;
  occasions: number;
  totalDays: number;
  /** Bradford score (occasions^2 * totalDays); present for both methods as info. */
  bradfordScore: number;
  /** The stage/band label the aggregates put them at, e.g. "Stage 2" or null. */
  derivedLabel: string | null;
  /** For stages: the derived stage number (1..4) or null. */
  derivedStage: number | null;
  /** The action text for the current band (Bradford) or stage, if defined. */
  action: string | null;
  /** The stage recorded at the last formal meeting, or null. */
  meetingStage: number | null;
  /**
   * True when the aggregates have pushed the person past the stage their last
   * meeting recorded, so a new absence-management meeting is due.
   */
  meetingDue: boolean;
  /** The meeting is due because of an absence after the last one, not the count (next-stage.ts). */
  dueAfterNewAbsence: boolean;
  /** The highest stage actually held, for the "last meeting" box (it stays 1 after a Stage 1
   *  meeting even when discounts put them back to no stage). */
  lastHeldStage: number | null;
  /** True when a meeting's absences were discounted below its trigger and they dropped back. */
  droppedBack: boolean;
  /** Every stage triggered and not yet held, lowest first (Phil, 2026-10-08: "show all the stages
   *  that have been triggered"). Empty when no meeting is due. */
  triggeredStages: number[];
  /** The stage history (stages method, every company since 0459): every stage reached
   *  at the date of the absence that reached it, with its own status (stage-history.ts). */
  history?: StageHistory;
  /** With the stage history: the stages a meeting can be booked or recorded at, lowest Due first. */
  offered?: number[];
};

/**
 * Sensible editable defaults (conventions, NOT legal requirements — the company
 * confirms/overrides them in Settings > Absence, informed by their policy).
 * Trigger points: the common "3 occasions in a rolling 12 months" pattern,
 * escalating. Bradford: the widely used 51 / 201 / 401 bands.
 */
export const DEFAULT_STAGE_THRESHOLDS: StageThreshold[] = [
  { stage: 1, label: "Stage 1", occasions: 3 },
  { stage: 2, label: "Stage 2", occasions: 4 },
  { stage: 3, label: "Stage 3", occasions: 6 },
  { stage: 4, label: "Stage 4", occasions: 8 },
];

export const DEFAULT_BRADFORD_BANDS: BradfordBand[] = [
  { threshold: 51, label: "Stage 1", action: "Informal discussion" },
  { threshold: 201, label: "Stage 2", action: "Written warning" },
  { threshold: 401, label: "Stage 3", action: "Final review" },
];

/* DEFAULT_ROLLING_WINDOW_DAYS is gone (2026-09-04). The window carries its own unit
   now, and a day count that no longer matches the default is worse than no constant:
   the default is DEFAULT_ABSENCE_WINDOW in lib/absence/window.ts. */

/** Bradford Factor: S squared times D (spells squared times total days). */
export function bradfordScore(occasions: number, totalDays: number): number {
  return occasions * occasions * totalDays;
}

function isStageThresholds(
  method: AbsenceMethod,
  t: StageThreshold[] | BradfordBand[],
): t is StageThreshold[] {
  return method === "stages";
}

/**
 * Map raw aggregates + config to the person's current absence status.
 * Deterministic and total: returns a status even with empty thresholds.
 */
export function deriveAbsenceStatus(
  agg: AbsenceAggregate,
  config: AbsenceConfig,
): AbsenceStatus {
  const occasions = Math.max(0, agg.occasions ?? 0);
  const totalDays = Math.max(0, agg.totalDays ?? 0);
  const score = bradfordScore(occasions, totalDays);
  let meetingStage = agg.latestMeetingStage ?? null;

  let derivedLabel: string | null = null;
  let derivedStage: number | null = null;
  let action: string | null = null;

  if (isStageThresholds(config.method, config.thresholds)) {
    const stages = [...(config.thresholds as StageThreshold[])].sort(
      (a, b) => a.stage - b.stage,
    );
    for (const s of stages) {
      if (s.occasions != null && occasions >= s.occasions) {
        derivedLabel = s.label;
        derivedStage = s.stage;
      }
    }
  } else {
    const bands = [...(config.thresholds as BradfordBand[])].sort(
      (a, b) => a.threshold - b.threshold,
    );
    for (const b of bands) {
      if (score >= b.threshold) {
        derivedLabel = b.label;
        action = b.action;
      }
    }
  }

  /* A MEETING WHOSE ABSENCES WERE DISCOUNTED DROPS THEM BACK (Phil, 2026-10-08: Asim and Jamie
     showed Stage 2 due after their Stage 1 meeting's absences were disallowed). When absences up
     to the latest held meeting were discounted and what still counts is below that meeting's
     trigger, they are back at the stage those absences reach (none, for fewer than Stage 1's), and
     from there the count decides: a Stage 3 meeting discounted to no further action leaves them at
     Stage 2, so the next absence brings Stage 3 again, not Stage 4. Absences that only aged out of
     the window do not do this (the 7 October rule below stands for them). An open booking above
     that stage still counts, so the card never jumps while a meeting is booked (0427). */
  let droppedBack = false;
  /* A meeting recorded from 0433 on carries the stage after decided when it was recorded, which
     already allows for its discounts: working it out again against today's window counted them
     twice (the absence recheck, 2026-10-08). Only an older meeting is worked out here. */
  if (isStageThresholds(config.method, config.thresholds) && !agg.heldStageAfterSet && agg.heldMeetingStage && agg.countedAtMeeting != null) {
    const stagesAll = config.thresholds as StageThreshold[];
    const trigger = stagesAll.find((s) => s.stage === agg.heldMeetingStage)?.occasions ?? null;
    // Only when no warning was given: a meeting that gave a warning leaves them at its stage.
    const warned = !!agg.heldMeetingWarning && agg.heldMeetingWarning.trim() !== "None" && agg.heldMeetingWarning.trim() !== "";
    if (!warned && (agg.discountedAtMeeting ?? 0) > 0 && trigger != null && agg.countedAtMeeting < trigger) {
      const reached = stagesAll
        .filter((s) => s.occasions != null && (agg.countedAtMeeting ?? 0) >= s.occasions)
        .reduce((m, s) => Math.max(m, s.stage), 0);
      // Only the held meeting is replaced; a higher open booking still holds.
      if ((meetingStage ?? 0) <= agg.heldMeetingStage) {
        meetingStage = reached || null;
        droppedBack = true;
      }
    }
  }

  /* A NEW ABSENCE AFTER A STAGE MEETING (Phil, 2026-10-07): the next stage is due even when the
     count alone has not reached it. lib/absence/next-stage.ts. Not after a drop back: there the
     count decides. */
  let dueAfterNewAbsence = false;
  if (isStageThresholds(config.method, config.thresholds) && !droppedBack) {
    const stagesList = config.thresholds as StageThreshold[];
    const next = stageDueAfterNewAbsence(
      meetingStage,
      Math.max(0, agg.absencesSinceMeeting ?? 0),
      stagesList.map((s) => s.stage),
    );
    if (next != null && (derivedStage == null || next > derivedStage)) {
      const row = stagesList.find((s) => s.stage === next);
      derivedStage = next;
      derivedLabel = row?.label ?? `Stage ${next}`;
      dueAfterNewAbsence = true;
    }
  }

  const meetingDue =
    derivedStage != null && (meetingStage == null || derivedStage > meetingStage);
  const triggeredStages: number[] = [];
  if (meetingDue && derivedStage != null && isStageThresholds(config.method, config.thresholds)) {
    for (let st = (meetingStage ?? 0) + 1; st <= derivedStage; st++) triggeredStages.push(st);
  }

  return {
    method: config.method,
    occasions,
    totalDays,
    bradfordScore: score,
    derivedLabel,
    derivedStage,
    action,
    meetingStage,
    meetingDue,
    dueAfterNewAbsence: dueAfterNewAbsence && meetingDue,
    lastHeldStage: agg.lastHeldStage ?? agg.latestMeetingStage ?? null,
    droppedBack,
    triggeredStages,
  };
}

/** Resolve a stored config row (possibly empty) into a usable AbsenceConfig. */
export function resolveAbsenceConfig(row: {
  method?: string | null;
  rolling_window_value?: number | null;
  rolling_window_unit?: string | null;
  thresholds?: unknown;
} | null): AbsenceConfig {
  const method: AbsenceMethod = row?.method === "bradford" ? "bradford" : "stages";
  const window = absenceWindowFrom(row?.rolling_window_value, row?.rolling_window_unit);
  const stored = Array.isArray(row?.thresholds) ? (row!.thresholds as unknown[]) : [];
  const thresholds =
    stored.length > 0
      ? (stored as StageThreshold[] | BradfordBand[])
      : method === "bradford"
        ? DEFAULT_BRADFORD_BANDS
        : DEFAULT_STAGE_THRESHOLDS;
  return { method, window, thresholds };
}

/** What the stage history needs about one person: every absence and every meeting, ever. */
export type StageHistoryInputs = {
  events: HistoryEvent[];
  meetings: HistoryMeeting[];
  todayIso: string;
};

/**
 * THE ONE WAY a person's absence stage is worked out (Phil, 2026-10-13). Every screen, check and
 * letter goes through this, by way of lib/absence/stage-switch.ts, which reads the company's switch
 * (companies.absence_stage_history) and passes the inputs only when it is on.
 *
 * No inputs, or a Bradford company: exactly the old count, deriveAbsenceStatus.
 * With inputs: the stages reached at the date of each absence (stage-history.ts), mapped onto the
 * same shape so every caller keeps working.
 */
export function resolveAbsenceStatus(
  agg: AbsenceAggregate,
  config: AbsenceConfig,
  inputs: StageHistoryInputs | null,
): AbsenceStatus {
  if (!inputs || !isStageThresholds(config.method, config.thresholds)) return deriveAbsenceStatus(agg, config);
  const stages = [...(config.thresholds as StageThreshold[])].sort((a, b) => a.stage - b.stage);
  const history = stageHistory({
    events: inputs.events,
    meetings: inputs.meetings,
    triggers: stages
      .filter((s) => s.occasions != null)
      .map((s) => ({ stage: Number(s.stage), occasions: Number(s.occasions) })),
    window: config.window,
    todayIso: inputs.todayIso,
  });
  const held = inputs.meetings.filter((m) => m.held && m.stage != null).map((m) => m.stage as number);
  const label = (n: number) => stages.find((s) => s.stage === n)?.label ?? `Stage ${n}`;
  const openStages = history.open.map((r) => r.stage);
  const top = openStages.length
    ? Math.max(...openStages)
    : history.current.length
      ? Math.max(...history.current.map((r) => r.stage))
      : null;
  const due = history.open.filter((r) => r.state === "due").map((r) => r.stage);
  const occasions = Math.max(0, agg.occasions ?? 0);
  const totalDays = Math.max(0, agg.totalDays ?? 0);
  return {
    method: config.method,
    occasions,
    totalDays,
    bradfordScore: bradfordScore(occasions, totalDays),
    derivedLabel: top != null ? label(top) : null,
    derivedStage: top,
    action: null,
    meetingStage: held.length ? Math.max(...held) : null,
    meetingDue: due.length > 0,
    dueAfterNewAbsence: false,
    lastHeldStage: held.length ? Math.max(...held) : null,
    droppedBack: false,
    triggeredStages: due,
    history,
    offered: bookableStages(history, held),
  };
}

/** The stages a meeting can be booked or recorded at with nothing booked: the switch's own list
 *  when it is on, otherwise the old rule (record-meeting.ts availableStages). */
export function offeredStages(status: Pick<AbsenceStatus, "offered" | "meetingStage" | "derivedStage">): number[] {
  return status.offered ?? availableStages(status.meetingStage, status.derivedStage);
}
