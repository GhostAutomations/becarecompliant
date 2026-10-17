/**
 * Be Care Compliant: live attendance and alerts, the pure half (Rota and Visits Stage 7, Phil's
 * popups 2026-10-17; docs/decisions/rota-visits.md, Stage 7). Importless, so node --test runs it.
 *
 * The database raises the alerts (rota_alerts_run, 0506 and 0507); this holds the words, the
 * clear down reasons and how the Today tab describes each visit.
 */

export type AlertKind = "late" | "missed" | "dose_not_recorded";

export const ALERT_KIND_WORDS: Record<AlertKind, string> = {
  late: "Visit late",
  missed: "Visit missed",
  dose_not_recorded: "Dose not recorded",
};

/** The Settings, Notifications rows (decision 4): grid id, database event, row name (at the default
 *  timings; alertGridName gives the company's own). */
export const ALERT_GRID_ROWS = [
  { id: "rota_visit_late", event: "visit_late", name: "Visit late (no clock in 15 minutes after the start)" },
  { id: "rota_visit_missed", event: "visit_missed", name: "Visit missed (no clock in 30 minutes after the end)" },
  { id: "rota_dose_not_recorded", event: "dose_not_recorded", name: "Dose not recorded at clock out" },
] as const;

/** A row's name with the company's Settings, Rota timings (0509). */
export function alertGridName(id: (typeof ALERT_GRID_ROWS)[number]["id"], t: { lateAfterMin: number; missedAfterEndMin: number }): string {
  if (id === "rota_visit_late") return `Visit late (no clock in ${t.lateAfterMin} minutes after the start)`;
  if (id === "rota_visit_missed") return `Visit missed (no clock in ${t.missedAfterEndMin} minutes after the end)`;
  return "Dose not recorded at clock out";
}

export type ClearReason = { code: string; label: string };

/** Clear down reasons (decision 10), A to Z with Other last; the codes the database accepts. */
export const VISIT_CLEAR_REASONS: readonly ClearReason[] = [
  { code: "arrived_late", label: "Carer arrived late" },
  { code: "forgot_clock_in", label: "Carer forgot to clock in, visit happened" },
  { code: "covered", label: "Covered by another carer" },
  { code: "su_cancelled", label: "Service user cancelled or not at home" },
  { code: "su_hospital", label: "Service user in hospital" },
  { code: "moved", label: "Visit moved by the office" },
  { code: "other", label: "Other" },
];
export const DOSE_CLEAR_REASONS: readonly ClearReason[] = [
  { code: "forgot_record", label: "Carer forgot to record, dose given" },
  { code: "dose_reason_told", label: "Dose not given, reason told to the office" },
  { code: "medicine_changed", label: "Medicine stopped or changed" },
  { code: "other", label: "Other" },
];

export function clearReasonsFor(kind: AlertKind): readonly ClearReason[] {
  return kind === "dose_not_recorded" ? DOSE_CLEAR_REASONS : VISIT_CLEAR_REASONS;
}

export function clearReasonLabel(code: string | null | undefined, text?: string | null): string {
  if (!code) return "";
  if (code === "other") return text?.trim() || "Other";
  return [...VISIT_CLEAR_REASONS, ...DOSE_CLEAR_REASONS].find((r) => r.code === code)?.label ?? code;
}

/** A visit's state on the Today tab (decisions 1 to 3). */
export type TodayStatus = "not_started" | "late" | "missed" | "in_progress" | "overrunning" | "done";

export const TODAY_STATUS_WORDS: Record<TodayStatus, string> = {
  not_started: "Not started",
  late: "Late",
  missed: "Missed",
  in_progress: "In progress",
  overrunning: "Overrunning",
  done: "Done",
};

/** The defaults; each company can change them in Settings, Rota (0509, Stage 7b decision 14). */
export const LATE_AFTER_MIN = 15;
export const MISSED_AFTER_END_MIN = 30;
export const OVERRUN_AFTER_END_MIN = 15;

export type AlertTimings = { lateAfterMin: number; missedAfterEndMin: number; overrunAfterEndMin: number };
const DEFAULT_TIMINGS: AlertTimings = { lateAfterMin: LATE_AFTER_MIN, missedAfterEndMin: MISSED_AFTER_END_MIN, overrunAfterEndMin: OVERRUN_AFTER_END_MIN };

/**
 * What the Today tab says about a visit right now. Late while any carer on it has not clocked in
 * 15 minutes after the start (or no carer at all); missed with no clock in 30 minutes after the end;
 * overrunning when clocked in and not out 15 minutes after the end; done when everyone who clocked
 * in has clocked out.
 */
export function todayStatus(v: {
  startsAtMs: number;
  endsAtMs: number;
  nowMs: number;
  carers: string[];
  clocks: { personId: string; kind: "in" | "out" }[];
}, t: AlertTimings = DEFAULT_TIMINGS): TodayStatus {
  const inIds = new Set(v.clocks.filter((c) => c.kind === "in").map((c) => c.personId));
  const outIds = new Set(v.clocks.filter((c) => c.kind === "out").map((c) => c.personId));
  const min = 60_000;
  if (inIds.size === 0) {
    if (v.nowMs >= v.endsAtMs + t.missedAfterEndMin * min) return "missed";
    if (v.nowMs >= v.startsAtMs + t.lateAfterMin * min) return "late";
    return "not_started";
  }
  const stillIn = [...inIds].some((id) => !outIds.has(id));
  if (!stillIn) {
    const someoneMissing = v.carers.some((id) => !inIds.has(id));
    return someoneMissing && v.nowMs < v.endsAtMs + t.missedAfterEndMin * min ? "late" : "done";
  }
  if (v.nowMs >= v.endsAtMs + t.overrunAfterEndMin * min) return "overrunning";
  const someoneMissing = v.carers.some((id) => !inIds.has(id));
  if (someoneMissing && v.nowMs >= v.startsAtMs + t.lateAfterMin * min) return "late";
  return "in_progress";
}

/** The pill colour for a status (RAG pills, screens rule). */
export function todayTone(s: TodayStatus): "pill-red" | "pill-amber" | "pill-green" | "pill-neutral" {
  return s === "missed" || s === "late" ? "pill-red" : s === "overrunning" ? "pill-amber" : s === "done" ? "pill-green" : "pill-neutral";
}

/** How many minutes late a clock in was ("On time" within the late time, 15 minutes by default), in words. */
export function arrivalWords(startsAtMs: number, clockInMs: number | null, lateAfterMin: number = LATE_AFTER_MIN): string | null {
  if (clockInMs == null) return null;
  const diff = Math.round((clockInMs - startsAtMs) / 60_000);
  if (diff <= lateAfterMin) return diff < -5 ? `${-diff} min early` : "On time";
  return `${diff} min late`;
}
