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
 *   - every other gap is "Area for Improvement likely";
 *   - a safety gap with a booking, a recognised reason, an in time DBS application or recorded
 *     holiday or absence is "Inspector's judgement: late for a recorded reason" (assessGap below).
 *
 * An action is a booking in the Planner (today or later), or an Update on the record linked to that
 * check and posted on or after the day it fell due, with its reason (Phil: "We have the updates in
 * the person record, can this be counted as an action note?", then "it depends on the note").
 *
 * This labels gaps. It never predicts the theme's rating: the 19 Sep rule stands, the manager
 * sets their own rating with CIW's descriptors (readiness_self_ratings, 0374).
 *
 * Pure and importless so it can be unit tested.
 */

export type GapRisk = "pan_risk" | "judgement" | "afi_likely";

/**
 * WHY IS IT LATE? (0375, snag S5, Phil 2 Oct: "it depends on the note, so if the note or reason was
 * staff member was on holiday or sick then the inspector may allow that for being late, or if a
 * service user goes into hospital, next of kin / power of attorney is unavailable"). Every reason
 * but Other is one an inspector may accept.
 */
export const LATE_REASONS = [
  { value: "holiday", label: "Staff member on holiday" },
  { value: "sickness", label: "Staff member off sick or absent" },
  { value: "hospital", label: "Service user in hospital" },
  { value: "nok_unavailable", label: "Next of kin or attorney unavailable" },
  { value: "booked", label: "Booked in the Planner" },
  { value: "other", label: "Other" },
] as const;
export type LateReason = (typeof LATE_REASONS)[number]["value"];

export function isLateReason(v: unknown): v is LateReason {
  return typeof v === "string" && LATE_REASONS.some((r) => r.value === v);
}
export function lateReasonLabel(v: string | null | undefined): string | null {
  return LATE_REASONS.find((r) => r.value === v)?.label ?? null;
}

export type GapUpdate = { on: string; by: string; reason: LateReason | null; dbsSubmittedOn: string | null };

export type GapAction =
  | { kind: "booked"; on: string }
  | { kind: "update"; on: string; by: string; reason: LateReason | null; dbsSubmittedOn: string | null }
  /** Spotted from Holidays and Absence: the person was away on the day it fell due. */
  | { kind: "away"; from: string; to: string; what: "holiday" | "absence" }
  | null;

export const GAP_RISK_LABEL: Record<GapRisk, string> = {
  pan_risk: "Priority Action Notice risk",
  judgement: "Inspector's judgement: late for a recorded reason",
  afi_likely: "Area for Improvement likely",
};

/** DBS renewal (0375, snag S6, Phil 2 Oct): the new application must have gone in at least eight
 *  weeks before the renewal date to count, the usual wait for a certificate. */
export const DBS_SUBMIT_WEEKS = 8;

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

function daysBefore(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** What one candidate action makes of the gap. */
function riskFor(safety: boolean, tracker: string | null, dueDate: string, action: Exclude<GapAction, null>): GapRisk {
  if (!safety) return "afi_likely";
  if (action.kind === "booked" || action.kind === "away") return "judgement";
  if (tracker === "dbs_renewal") {
    return action.dbsSubmittedOn && action.dbsSubmittedOn <= daysBefore(dueDate, DBS_SUBMIT_WEEKS * 7) ? "judgement" : "pan_risk";
  }
  return action.reason && action.reason !== "other" ? "judgement" : "pan_risk";
}

const RISK_RANK: Record<GapRisk, number> = { judgement: 0, afi_likely: 1, pan_risk: 2 };

/**
 * CIW's matrix for one overdue gap (framework paragraphs 10 to 13): the impact, from what the gap is
 * (a safety gap is at least moderate), and whether it is likely to continue, from what is in place.
 *
 * - Not a safety gap: "Area for Improvement likely", with or without an action.
 * - A safety gap with nothing in place, an Update with no reason or "Other", or a DBS application sent
 *   later than eight weeks before the renewal date: "Priority Action Notice risk".
 * - A safety gap booked in the Planner (today or later), with a recognised reason, a DBS application
 *   sent in time, or the person away on recorded holiday or absence when it fell due: "Inspector's
 *   judgement: late for a recorded reason" (moderate and unlikely to recur is the inspector's call).
 *
 * Only Updates posted on or after the due date count. The action shown is the one that best answers
 * the gap; among equals, a booking, then the newest Update, then the absence.
 */
export function assessGap(input: {
  safety: boolean;
  tracker?: "dbs_renewal" | "right_to_work" | null;
  dueDate: string;
  todayIso: string;
  bookings: string[];
  updates: GapUpdate[];
  away: Array<{ from: string; to: string; what: "holiday" | "absence" }>;
}): { action: GapAction; risk: GapRisk } {
  const tracker = input.tracker ?? null;
  const candidates: Array<Exclude<GapAction, null>> = [];
  const ahead = input.bookings.filter((d) => d >= input.todayIso).sort();
  if (ahead.length > 0) candidates.push({ kind: "booked", on: ahead[0] });
  for (const u of [...input.updates].filter((u) => u.on >= input.dueDate).sort((a, b) => (a.on < b.on ? 1 : -1))) {
    candidates.push({ kind: "update", on: u.on, by: u.by, reason: u.reason, dbsSubmittedOn: u.dbsSubmittedOn });
  }
  for (const a of input.away) {
    if (a.from <= input.dueDate && a.to >= input.dueDate) candidates.push({ kind: "away", from: a.from, to: a.to, what: a.what });
  }
  if (candidates.length === 0) return { action: null, risk: input.safety ? "pan_risk" : "afi_likely" };
  let best = candidates[0];
  let bestRisk = riskFor(input.safety, tracker, input.dueDate, best);
  for (const c of candidates.slice(1)) {
    const r = riskFor(input.safety, tracker, input.dueDate, c);
    if (RISK_RANK[r] < RISK_RANK[bestRisk]) {
      best = c;
      bestRisk = r;
    }
  }
  return { action: best, risk: bestRisk };
}

/** In hand: there is an action, and it is not still a Priority Action Notice risk (snag S2). */
export function gapInHand(g: { action: GapAction; risk: GapRisk | null }): boolean {
  return g.action !== null && g.risk !== "pan_risk";
}

/**
 * A measure below 85% (the line the theme status already uses, and the PQS 7 band) is an Area for
 * Improvement likely; safeguarding training under half the team is a safety gap. The "CIW Good"
 * lines that used to sit under the measures were taken off (snag S3, Phil 2 Oct).
 */
export function metricGap(label: string, pct: number | null): { risk: GapRisk } | null {
  if (pct == null || pct >= 85) return null;
  const safety = /safeguarding/i.test(label) && pct < 50;
  return { risk: safety ? "pan_risk" : "afi_likely" };
}

/** The action in words, the same on the Readiness row, in the pack, the assistant and Reg 80. */
export function actionText(action: GapAction, fmt: (iso: string) => string): string | null {
  if (!action) return null;
  if (action.kind === "booked") return `Booked ${fmt(action.on)}`;
  if (action.kind === "away") {
    return `${action.what === "holiday" ? "On holiday" : "Off sick or absent"} ${fmt(action.from)} to ${fmt(action.to)}, when it fell due`;
  }
  const reason = lateReasonLabel(action.reason);
  return [
    `Action noted ${fmt(action.on)} by ${action.by}`,
    reason ? `: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : "",
    action.dbsSubmittedOn ? `, DBS applied ${fmt(action.dbsSubmittedOn)}` : "",
  ].join("");
}
