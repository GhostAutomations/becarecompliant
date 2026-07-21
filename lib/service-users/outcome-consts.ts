// Shared, pure constants for personal outcomes (client + server safe).

export type OutcomeStatus = "achieved" | "progressing" | "working_towards" | "no_longer_relevant";

export const OUTCOME_STATUSES: { value: OutcomeStatus; label: string; pill: string }[] = [
  { value: "achieved", label: "Achieved", pill: "pill-green" },
  { value: "progressing", label: "Progressing", pill: "pill-green" },
  { value: "working_towards", label: "Working towards", pill: "pill-amber" },
  { value: "no_longer_relevant", label: "No longer relevant", pill: "pill-neutral" },
];

export const OUTCOME_STATUS_LABEL: Record<OutcomeStatus, string> =
  Object.fromEntries(OUTCOME_STATUSES.map((s) => [s.value, s.label])) as Record<OutcomeStatus, string>;

export const OUTCOME_STATUS_PILL: Record<OutcomeStatus, string> =
  Object.fromEntries(OUTCOME_STATUSES.map((s) => [s.value, s.pill])) as Record<OutcomeStatus, string>;

/** For the PQS: an outcome "counts" (is in scope) unless it is no longer relevant,
 *  and is "achieving or progressing" when Achieved or Progressing. */
export function isOutcomeInScope(status: OutcomeStatus): boolean {
  return status !== "no_longer_relevant";
}
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

/** RAG for the outcomes review: red overdue, amber due within 30 days or never
 *  reviewed, green on track, none when there is nothing to review. */
export function outcomesReviewRag(
  latestReviewIso: string | null,
  intervalMonths: number,
  todayIso: string,
  hasOutcomes: boolean,
): { rag: ReviewRag; dueIso: string | null; label: string } {
  if (!hasOutcomes) return { rag: "none", dueIso: null, label: "No outcomes" };
  if (!latestReviewIso) return { rag: "amber", dueIso: null, label: "Never reviewed" };
  const dueIso = addMonthsIso(latestReviewIso, Math.max(1, intervalMonths));
  const soonIso = addMonthsIso(todayIso, 0); // today; compare with a 30-day window below
  void soonIso;
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const in30 = new Date(Date.UTC(ty, tm - 1, td + 30)).toISOString().slice(0, 10);
  if (dueIso < todayIso) return { rag: "red", dueIso, label: "Overdue" };
  if (dueIso <= in30) return { rag: "amber", dueIso, label: "Due soon" };
  return { rag: "green", dueIso, label: "On track" };
}

export const REVIEW_RAG_PILL: Record<ReviewRag, string> = {
  green: "pill-green",
  amber: "pill-amber",
  red: "pill-red",
  none: "pill-neutral",
};

export type OutcomeRow = {
  id: string;
  statement: string;
  status: OutcomeStatus;
  last_reviewed: string | null;
  review_note: string | null;
  position: number;
};
