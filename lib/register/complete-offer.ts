/**
 * Be Care Compliant — who is offered Complete on a check, and what a Complete page says when it
 * sends somebody back to the record.
 *
 * ONE RULE FOR EVERY WAY IN: the record's tiles, the register cells, and the Complete page itself
 * (which is reached by typing the URL too). Before this, the register linked Recruiters, and
 * anyone looking at their own row, to a Complete page that bounced them straight back with no
 * word of why (step 7 review, 11 Oct 2026).
 *
 * The database says the same (0444): complete_check and may_file_evidence refuse your own record,
 * and refuse a Recruiter unless they are booked on the Planner to carry out THAT check (Phil by
 * popup, 11 Oct 2026, after the step 7 review: being booked is the permission, 0183). Seniors are
 * not here: their Complete page asks senior_may_do_instance per check.
 *
 * Pure and importless so it can be unit tested.
 */

/** The roles offered Complete on any check they can see. RLS and the database decide the record. */
export const CHECK_COMPLETE_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

export type CompleteRefusal = "own_record" | "not_booked" | "role";

/** Why this login may not complete this check, or null when they may. */
export function checkCompleteRefusal(opts: {
  role: string;
  /** The record is the signed in login's own People record. Always false for a service user. */
  ownRecord: boolean;
  /** They are the conductor of a planned Planner task for this check, booked by somebody else. */
  bookedForThisCheck: boolean;
}): CompleteRefusal | null {
  if (opts.ownRecord) return "own_record";
  if (CHECK_COMPLETE_ROLES.includes(opts.role)) return null;
  if (opts.role === "recruiter") return opts.bookedForThisCheck ? null : "not_booked";
  return "role";
}

/** Shorthand for the tiles and the register cells. */
export function mayOfferCheckComplete(opts: { role: string; ownRecord: boolean; bookedForThisCheck: boolean }): boolean {
  return checkCompleteRefusal(opts) === null;
}

/** The words the record shows after a Complete page sent somebody back. Match the database's. */
export const COMPLETE_REFUSED_TEXT: Record<CompleteRefusal, string> = {
  own_record: "This is your own record, so someone else must complete this check.",
  not_booked: "A Recruiter completes a check only when they are booked on the Planner to do it.",
  role: "Your role cannot complete checks.",
};

/** The banner for ?refused= on a record page, or null for anything that is not one of ours. */
export function completeRefusedText(code: string | null | undefined): string | null {
  if (code === "own_record" || code === "not_booked" || code === "role") return COMPLETE_REFUSED_TEXT[code];
  return null;
}
