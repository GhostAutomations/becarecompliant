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

export type OutcomeRow = {
  id: string;
  statement: string;
  status: OutcomeStatus;
  last_reviewed: string | null;
  review_note: string | null;
  position: number;
};
