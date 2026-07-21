// Shared, pure constants for personal outcomes (client + server safe).
//
// An outcome is a rich, per-person goal ("what matters to me") that is tracked over
// time with progress updates. Its status is derived from the latest update:
//   working_towards  - created, no progress update yet
//   progressing      - last update said progressing
//   no_change        - last update said no change
//   regressing       - last update said regressing
//   achieved         - marked complete (moves to the Achieved list)
// archived_at soft-removes an outcome from all counts.

export type OutcomeStatus = "working_towards" | "progressing" | "no_change" | "regressing" | "achieved";

export const OUTCOME_STATUSES: { value: OutcomeStatus; label: string; pill: string }[] = [
  { value: "working_towards", label: "Working towards", pill: "pill-neutral" },
  { value: "progressing", label: "Progressing", pill: "pill-green" },
  { value: "no_change", label: "No change", pill: "pill-amber" },
  { value: "regressing", label: "Regressing", pill: "pill-red" },
  { value: "achieved", label: "Achieved", pill: "pill-green" },
];

export const OUTCOME_STATUS_LABEL: Record<OutcomeStatus, string> =
  Object.fromEntries(OUTCOME_STATUSES.map((s) => [s.value, s.label])) as Record<OutcomeStatus, string>;

export const OUTCOME_STATUS_PILL: Record<OutcomeStatus, string> =
  Object.fromEntries(OUTCOME_STATUSES.map((s) => [s.value, s.pill])) as Record<OutcomeStatus, string>;

// Progress update options (what a reviewer records against an outcome).
export type OutcomeProgress = "progressing" | "no_change" | "regressing";

export const OUTCOME_PROGRESS: { value: OutcomeProgress; label: string; pill: string }[] = [
  { value: "progressing", label: "Progressing", pill: "pill-green" },
  { value: "no_change", label: "No change", pill: "pill-amber" },
  { value: "regressing", label: "Regressing", pill: "pill-red" },
];

export const OUTCOME_PROGRESS_LABEL: Record<OutcomeProgress, string> =
  Object.fromEntries(OUTCOME_PROGRESS.map((s) => [s.value, s.label])) as Record<OutcomeProgress, string>;

export const OUTCOME_PROGRESS_PILL: Record<OutcomeProgress, string> =
  Object.fromEntries(OUTCOME_PROGRESS.map((s) => [s.value, s.pill])) as Record<OutcomeProgress, string>;

/** For the PQS: an active (non-archived) outcome is in scope; it is "achieving or
 *  progressing" when Achieved or Progressing. */
export function isOutcomeAchievingOrProgressing(status: OutcomeStatus): boolean {
  return status === "achieved" || status === "progressing";
}

/** Add whole months to a YYYY-MM-DD date, clamping the day to the month end. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export type ReviewRag = "green" | "amber" | "red" | "none";

/** RAG for how overdue an active outcome is for its next progress update. Green on
 *  track, amber due within 30 days or never updated, red overdue, none for
 *  achieved/archived. */
export function outcomeUpdateRag(
  lastActivityIso: string | null,
  intervalMonths: number,
  todayIso: string,
  isActive: boolean,
): { rag: ReviewRag; dueIso: string | null; label: string } {
  if (!isActive) return { rag: "none", dueIso: null, label: "" };
  if (!lastActivityIso) return { rag: "amber", dueIso: null, label: "Needs an update" };
  const dueIso = addMonthsIso(lastActivityIso, Math.max(1, intervalMonths));
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const in30 = new Date(Date.UTC(ty, tm - 1, td + 30)).toISOString().slice(0, 10);
  if (dueIso < todayIso) return { rag: "red", dueIso, label: "Update overdue" };
  if (dueIso <= in30) return { rag: "amber", dueIso, label: "Update due soon" };
  return { rag: "green", dueIso, label: "On track" };
}

export const REVIEW_RAG_PILL: Record<ReviewRag, string> = {
  green: "pill-green",
  amber: "pill-amber",
  red: "pill-red",
  none: "pill-neutral",
};

export type OutcomeUpdateRow = {
  id: string;
  kind: "progress" | "completed" | "reopened";
  progress: OutcomeProgress | null;
  note: string | null;
  author_name: string | null;
  created_at: string;
};

export type OutcomeRow = {
  id: string;
  title: string;
  detail: string | null;
  status: OutcomeStatus;
  target_date: string | null;
  achieved_at: string | null;
  last_update_at: string | null;
  created_at: string;
  position: number;
  updates: OutcomeUpdateRow[];
};
