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
     * NOT BUILT YET. Phil asked for it in the same breath as the other two, and there is no
     * incident form anywhere in the product: incidents are written up through the Incidents
     * module's own pages, which a carer cannot reach. Shown greyed and saying so, rather than
     * left off, because a tick that is missing looks like the screen forgot it and a tick that
     * does nothing is worse than either.
     */
    key: "incident_report",
    label: "Report an incident",
    hint: "What happened, when, and who was there.",
    available: false,
    locked: false,
    note: "Not in the portal yet. Incidents are written up by the branch today.",
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
