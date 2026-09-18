/**
 * Be Care Compliant — what a Team Member can fill in from their own portal.
 *
 * Pure and deliberately IMPORTLESS so node --test can load it.
 *
 * WHY THIS IS NOT A LIST OF DEPARTMENTS (Phil, 2026-09-17): "For Team Member instead of access to
 * departments it should be controlling access to forms as that is all they can see". He is right,
 * and it is why their tile looked so odd: fifteen greyed departments and one tick. A carer's
 * portal is not a department they browse, it is a short list of things they may fill in.
 *
 * STORED IN THE SAME TABLE as the department ticks, under a `form:` prefix, so switching one off
 * is the same row, the same policy and the same audit entry. Absence still means on.
 */

export type PortalForm = {
  /** The company form key, or a route where the thing is not a form template. */
  key: string;
  label: string;
  hint: string;
  /** Built and reachable in the portal today. */
  available: boolean;
  /** Cannot be switched off, whoever asks. */
  locked: boolean;
  note?: string;
};

export const PORTAL_FORMS: readonly PortalForm[] = [
  {
    key: "holiday_requests",
    label: "Holiday request",
    hint: "Book time off and see where a request has got to.",
    available: true,
    locked: false,
  },
  {
    key: "financial_transaction",
    label: "Financial transaction",
    hint: "Money taken for shopping, a prescription or a top up, signed at the door.",
    available: true,
    locked: false,
  },
  {
    /*
     * SELECTABLE (Phil, 2026-09-17: "have raise a concern slectable"), having first shipped
     * locked on. Recorded rather than quietly changed, because the argument for locking it is
     * still true and the next person to read this file will wonder: the people most likely to
     * have something to disclose are the ones whose employer would most want the box unticked,
     * and this is the only way a carer reaches the Admin and the Responsible Individual without
     * going through their own manager.
     *
     * So it is a tick like the others, and the tile says what unticking it costs rather than
     * refusing. A company that has its own route can switch ours off; a company that has not is
     * told what it has just removed.
     */
    key: "whistleblowing",
    label: "Raise a concern",
    hint: "Goes to the Admin and the Responsible Individual only, never to their manager.",
    available: true,
    locked: false,
    note: "Switching this off leaves a carer no way to raise a concern except through their own manager.",
  },
  {
    /*
     * BUILT, 2026-09-18. It was greyed out here for months with the note "Incidents are written
     * up by the branch today" -- which was the whole problem: the person who saw the incident
     * could not report it, so Thistle's staff filled in a form on another system and the branch
     * typed up a record from what they were told. Filing this opens a real case (0301/0302).
     */
    key: "incident_report",
    label: "Report an incident",
    hint: "What happened, when, and who was there. Filing it opens a case for the branch.",
    available: true,
    locked: false,
    note: "Switching this off leaves a carer no way to report an incident except by telling somebody.",
  },
];

/** The row key a portal form is stored under, so nobody builds the string by hand twice. */
export function portalFormKey(key: string): string {
  return `form:${key}`;
}

/**
 * May a Team Member fill this in, in this company?
 *
 * `disabled` is the same `role|module` set the departments use, so one read answers both.
 */
export function canUsePortalForm(key: string, disabled: ReadonlySet<string> = new Set()): boolean {
  const form = PORTAL_FORMS.find((f) => f.key === key);
  if (!form || !form.available) return false;
  if (form.locked) return true;
  return !disabled.has(`staff|${portalFormKey(key)}`);
}
