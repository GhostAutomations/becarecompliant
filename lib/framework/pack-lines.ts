/**
 * Be Care Compliant — what the Inspection Readiness Pack says about each theme.
 *
 * Operation Thistle list, number 15 (2026-09-23): the pack still printed the OLD model. Every theme had a
 * "Score: N%" and the cover said "Overall readiness: N%", when the Readiness page itself stopped
 * showing either on 2026-09-19 (Phil: CIW rates each theme separately, by judgement, with no
 * overall rating). So a manager could read "On track" on screen and hand an inspector a document
 * that said 71%, a number the product no longer stands behind. The pack also listed themes nothing
 * feeds (Environment, which CIW does not rate for a domiciliary service) as "Not mapped".
 *
 * The pack now says what the page says, in the same order: the status, the one line reason, the
 * check counts, what is not scheduled or waiting, the other signals, and any open notices. No
 * score and no overall figure anywhere.
 *
 * Pure and importless so it can be unit tested; the route passes in the words it already has.
 */

export type PackThemeInput = {
  title: string;
  statusText: string;
  reason: string;
  checks: { total: number; overdue: number; dueSoon: number; onTrack: number; unscheduled: number };
  /** The waiting line from lib/framework/waiting.ts, or null when nothing is waiting. */
  waitingLine: string | null;
  metrics: Array<{ label: string; pct: number | null; note?: string | null }>;
  notices: { priority: number; improvement: number };
};

export type PackPair = { label: string; value: string };

/** The heading for a theme: its name and status, with no dash between them. */
export function packThemeHeading(t: Pick<PackThemeInput, "title" | "statusText">): string {
  return `${t.title}: ${t.statusText}`;
}

export function packThemePairs(t: PackThemeInput): PackPair[] {
  const pairs: PackPair[] = [{ label: "Summary", value: t.reason }];
  if (t.checks.total > 0) {
    pairs.push({
      label: "Checks",
      value: `${t.checks.overdue} overdue, ${t.checks.dueSoon} due soon, ${t.checks.onTrack} on track`,
    });
  }
  if (t.checks.unscheduled > 0) {
    pairs.push({
      label: "Not scheduled",
      value: `${t.checks.unscheduled} ${t.checks.unscheduled === 1 ? "check has" : "checks have"} no due date`,
    });
  }
  if (t.waitingLine) pairs.push({ label: "Waiting", value: t.waitingLine });
  for (const m of t.metrics) {
    pairs.push({ label: m.label, value: m.pct != null ? `${m.pct}%` : (m.note ?? "No data yet") });
  }
  const notices: string[] = [];
  if (t.notices.priority > 0) {
    notices.push(`${t.notices.priority} Priority Action ${t.notices.priority === 1 ? "Notice" : "Notices"} open`);
  }
  if (t.notices.improvement > 0) {
    notices.push(`${t.notices.improvement} ${t.notices.improvement === 1 ? "Area" : "Areas"} for Improvement open`);
  }
  if (notices.length > 0) pairs.push({ label: "Notices", value: notices.join(", ") });
  return pairs;
}
