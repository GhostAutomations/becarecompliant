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

export type AbsenceMethod = "stages" | "bradford";

/** Trigger-point stage: fires when the number of occasions crosses the threshold. */
export type StageThreshold = {
  stage: number; // 1..4
  label: string;
  occasions?: number; // e.g. 3 separate absences
};

/** Bradford action band: fires when the score reaches the threshold. */
export type BradfordBand = {
  threshold: number; // Bradford score
  label: string; // e.g. "Stage 1"
  action: string; // e.g. "Informal discussion"
};

export type AbsenceConfig = {
  method: AbsenceMethod;
  rollingWindowDays: number;
  /** StageThreshold[] when method='stages', BradfordBand[] when 'bradford'. */
  thresholds: StageThreshold[] | BradfordBand[];
};

/** Raw per-person aggregate from person_absence_summary. */
export type AbsenceAggregate = {
  occasions: number;
  totalDays: number;
  /** Highest stage a formal meeting has recorded, if any. */
  latestMeetingStage: number | null;
};

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

export const DEFAULT_ROLLING_WINDOW_DAYS = 365;

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
  const meetingStage = agg.latestMeetingStage ?? null;

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

  const meetingDue =
    derivedStage != null && (meetingStage == null || derivedStage > meetingStage);

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
  };
}

/** Resolve a stored config row (possibly empty) into a usable AbsenceConfig. */
export function resolveAbsenceConfig(row: {
  method?: string | null;
  rolling_window_days?: number | null;
  thresholds?: unknown;
} | null): AbsenceConfig {
  const method: AbsenceMethod = row?.method === "bradford" ? "bradford" : "stages";
  const rollingWindowDays = row?.rolling_window_days ?? DEFAULT_ROLLING_WINDOW_DAYS;
  const stored = Array.isArray(row?.thresholds) ? (row!.thresholds as unknown[]) : [];
  const thresholds =
    stored.length > 0
      ? (stored as StageThreshold[] | BradfordBand[])
      : method === "bradford"
        ? DEFAULT_BRADFORD_BANDS
        : DEFAULT_STAGE_THRESHOLDS;
  return { method, rollingWindowDays, thresholds };
}
