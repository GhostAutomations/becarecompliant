/**
 * Be Care Compliant — which company forms may be sent as a BRIEFING.
 *
 * A briefing asks a Team Member to complete a form ABOUT THEMSELVES, and files the
 * result as Evidence on their own record. Almost every form in the product is the
 * opposite: a manager-conducted compliance check (Supervision, Appraisal, Spot
 * Check, Probation, Audit, Mentoring, DBS, Right to Work, competency assessments,
 * absence records) that a member of staff must never fill in about themselves —
 * doing so would put self-marked evidence on a regulator's file.
 *
 * So this is an ALLOWLIST, not a denylist: a form is briefable only if its key is
 * named here. Any new or unknown form is NOT briefable until it is added on
 * purpose. Mirrors lib/public-forms/config.ts, which restricts the public path
 * for exactly the same reason.
 *
 * Isomorphic: no side effects, safe to import from client or server.
 */

export const BRIEFABLE_FORM_KEYS = ["holiday_requests"] as const;

export type BriefableFormKey = (typeof BRIEFABLE_FORM_KEYS)[number];

const BRIEFABLE = new Set<string>(BRIEFABLE_FORM_KEYS);

/** May a form with this key be sent as a briefing? Unknown or empty keys are refused. */
export function isBriefableFormKey(key: string | null | undefined): boolean {
  return key != null && BRIEFABLE.has(key);
}
