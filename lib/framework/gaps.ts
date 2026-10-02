/**
 * Be Care Compliant — what CIW would likely make of each gap on the Readiness page.
 *
 * WHY (Phil, 2026-10-02, after reading CIW's inspection framework of May 2025 and its quality of
 * care review guidance together). CIW decides between an Area for Improvement and a Priority
 * Action Notice with a matrix: the impact on people (negligible, minor, moderate, major) against
 * how likely the problem is to continue. It is "unlikely" when "measures have been taken or are
 * currently being implemented". So each gap carries CIW's own words, in plain terms:
 *
 *   - a SAFETY gap (people could come to harm: a lapsed DBS, an expired Right to Work, overdue
 *     medication competency or MAR audits, an overdue risk assessment, safeguarding training
 *     under half the team) with nothing in place is "Priority Action Notice risk";
 *   - every other gap, and a safety gap with an action in place, is "Area for Improvement likely".
 *
 * An action is in place when the check is BOOKED in the Planner (today or later), or when an
 * Update on the record, linked to that check, was posted on or after the day it fell due (Phil:
 * "We have the updates in the person record, can this be counted as an action note?").
 *
 * This labels gaps. It never predicts the theme's rating: the 19 Sep rule stands, the manager
 * sets their own rating with CIW's descriptors (readiness_self_ratings, 0374).
 *
 * Pure and importless so it can be unit tested.
 */

export type GapRisk = "pan_risk" | "afi_likely";

export type GapAction =
  | { kind: "booked"; on: string }
  | { kind: "update"; on: string; by: string }
  | null;

export const GAP_RISK_LABEL: Record<GapRisk, string> = {
  pan_risk: "Priority Action Notice risk",
  afi_likely: "Area for Improvement likely",
};

/** Check keys that are safety gaps when overdue. Matched by key first, then by name, so a
 *  company that called its own check "MAR Audit" or "Risk Assessment Review" is still caught. */
const SAFETY_KEYS = new Set([
  "competency",
  "medication_competency",
  "mar_audit",
  "medication_audit",
  "risk_assessment",
  "dbs_renewal",
  "right_to_work",
]);
const SAFETY_NAME = /\b(medication competenc\w*|mar (audit|check)\w*|medication audit\w*|risk assessment\w*|dbs|right to work)\b/i;

export function isSafetyCheck(key: string | null | undefined, name: string | null | undefined): boolean {
  if (key && SAFETY_KEYS.has(key.trim().toLowerCase())) return true;
  return !!name && SAFETY_NAME.test(name);
}

/**
 * The action that counts, if any. A booking still to happen wins (it says when); otherwise the
 * most recent linked Update posted on or after the due date. An Update written before the check
 * fell due is not an answer to it being overdue.
 */
export function actionInPlace(input: {
  dueDate: string;
  todayIso: string;
  bookings: string[]; // scheduled dates of planned bookings for this check
  updates: Array<{ on: string; by: string }>; // linked updates, on = YYYY-MM-DD (London)
}): GapAction {
  const ahead = input.bookings.filter((d) => d >= input.todayIso).sort();
  if (ahead.length > 0) return { kind: "booked", on: ahead[0] };
  const after = input.updates.filter((u) => u.on >= input.dueDate).sort((a, b) => (a.on < b.on ? 1 : -1));
  if (after.length > 0) return { kind: "update", on: after[0].on, by: after[0].by };
  return null;
}

export function gapRisk(safety: boolean, action: GapAction): GapRisk {
  return safety && !action ? "pan_risk" : "afi_likely";
}

/** What CIW's framework says Good looks like, for the measure a gap is about. */
export function ciwAnchor(label: string, themeCode: string | null = null): string | null {
  const l = label.toLowerCase();
  /* "Completed by the due date" is every check in the theme: supervision under Leadership and
     Management, personal plan reviews and the rest under Care and Support. */
  if (l.includes("completed by the due date") && themeCode === "CS") {
    return "CIW Good: personal plans reviewed regularly, with people involved (the Cardiff PQS measures three monthly reviews).";
  }
  if (l.includes("supervision") || l.includes("completed by the due date")) {
    return "CIW Good: one to one supervision at least quarterly, and an annual review.";
  }
  if (l.includes("safeguarding")) return "CIW Good: staff understand and follow the Wales Safeguarding Procedures.";
  if (l.includes("social care wales")) return "CIW Good: staff appropriately registered with professional bodies.";
  if (l.includes("training")) return "CIW Good: lapsed training identified and addressed in a timely way.";
  if (l.includes("complaint")) return "CIW Good: complaints thoroughly investigated and responded to promptly.";
  if (l.includes("incident")) return "CIW Good: timely notifications to relevant authorities.";
  if (l.includes("satisfaction")) return "CIW Good: people kept informed of the outcomes of their feedback.";
  if (l.includes("outcome")) return "CIW Good: many people supported to achieve their well-being outcomes.";
  return null;
}

/**
 * A measure below where CIW's "Good" sits. 85 is the line the theme status already uses (and the
 * PQS 7 band). Safeguarding training under half the team is a safety gap.
 */
export function metricGap(
  label: string,
  pct: number | null,
  themeCode: string | null = null,
): { risk: GapRisk; anchor: string | null } | null {
  if (pct == null || pct >= 85) return null;
  const safety = /safeguarding/i.test(label) && pct < 50;
  return { risk: safety ? "pan_risk" : "afi_likely", anchor: ciwAnchor(label, themeCode) };
}
