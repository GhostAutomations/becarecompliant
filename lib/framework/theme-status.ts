/**
 * Be Care Compliant — where a regulator theme stands, and why, in one line.
 *
 * WHY IT IS SHAPED LIKE THIS (Phil, 2026-09-19, after reading CIW's inspection framework of March
 * 2025 together). CIW rates EACH THEME by an inspector's judgement and awards no overall rating,
 * so the dashboard no longer shows one averaged percentage. It shows each theme with where the
 * evidence stands, and the reason, in our own words (On track / Attention / Action needed): our
 * data can show the evidence is in place, it cannot predict an inspector's word.
 *
 * The one fixed rule in the framework is honoured exactly: an open PRIORITY ACTION NOTICE means
 * the theme "must be rated as Requires significant improvement", so it is Action needed whatever
 * else is true. An Area for Improvement can leave a theme Good, so it only ever raises a theme to
 * Attention.
 *
 * Pure and importless, so it is unit tested.
 */

export type ThemeRag = "red" | "amber" | "green" | "none";

export type ThemeInputs = {
  overdue: number;
  dueSoon: number;
  /** Checks with a due date. 0 means no checks feed this theme. */
  total: number;
  /** On time completion over the last six months, counted by items that fell due. */
  onTimePct: number | null;
  /** Other percentages that feed the theme: training, outcomes, satisfaction. */
  metrics: Array<{ label: string; pct: number | null }>;
  priorityOpen: number;
  improvementOpen: number;
  /** Complaints and incidents past a deadline, each with how to name it ("complaint", "incident"). */
  caseOverdue?: Array<{ singular: string; plural: string; count: number }>;
};

const RANK: Record<ThemeRag, number> = { none: 0, green: 1, amber: 2, red: 3 };
const worst = (a: ThemeRag, b: ThemeRag): ThemeRag => (RANK[a] >= RANK[b] ? a : b);

/** A percentage as a status: 85 and over on track, 50 and over attention, under 50 action. */
export function pctRag(pct: number | null): ThemeRag {
  if (pct == null) return "none";
  if (pct >= 85) return "green";
  if (pct >= 50) return "amber";
  return "red";
}

export function themeStatus(t: ThemeInputs): ThemeRag {
  if (t.priorityOpen > 0) return "red";
  let s: ThemeRag = "none";
  if (t.total > 0) s = worst(s, t.overdue > 0 ? "red" : t.dueSoon > 0 ? "amber" : "green");
  if ((t.caseOverdue ?? []).some((c) => c.count > 0)) s = worst(s, "red");
  s = worst(s, pctRag(t.onTimePct));
  for (const m of t.metrics) s = worst(s, pctRag(m.pct));
  if (t.improvementOpen > 0) s = worst(s, "amber");
  return s;
}

/** The single most important reason, for a one line tile. Worst first. */
export function themeReason(t: ThemeInputs, regulatorName: string): string {
  if (t.priorityOpen > 0) {
    return t.priorityOpen === 1
      ? `${regulatorName} Priority Action Notice open`
      : `${t.priorityOpen} ${regulatorName} Priority Action Notices open`;
  }
  const cases = (t.caseOverdue ?? []).filter((c) => c.count > 0);
  if (t.overdue > 0 || cases.length > 0) {
    const parts = [
      ...(t.overdue > 0 ? [`${t.overdue} ${t.overdue === 1 ? "check" : "checks"}`] : []),
      ...cases.map((c) => `${c.count} ${c.count === 1 ? c.singular : c.plural}`),
    ];
    return `${parts.join(", ")} overdue`;
  }
  const low = [
    ...(t.onTimePct != null ? [{ label: "on time, last 6 months", pct: t.onTimePct }] : []),
    ...t.metrics.filter((m): m is { label: string; pct: number } => m.pct != null),
  ].sort((a, b) => a.pct - b.pct)[0];
  if (low && low.pct < 85) return `${Math.floor(low.pct)}% ${low.label.toLowerCase()}`;
  if (t.improvementOpen > 0) {
    return t.improvementOpen === 1 ? "1 Area for Improvement open" : `${t.improvementOpen} Areas for Improvement open`;
  }
  if (t.dueSoon > 0) return `${t.dueSoon} due soon`;
  if (t.total === 0 && t.metrics.every((m) => m.pct == null) && t.onTimePct == null) {
    return (t.caseOverdue ?? []).length > 0 ? "Nothing outstanding" : "Nothing feeds this yet";
  }
  return "Up to date";
}
