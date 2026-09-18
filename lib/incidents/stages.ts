/**
 * Be Care Compliant — the three stages of an incident, and what each one unlocks.
 *
 * WHY (Phil, 2026-09-18): "reported in a form, a case is opened and then a investigation is
 * required and then an outcome with recomendations, on investigation have a no further action
 * option, which means no outcome is required."
 *
 * The rule that matters is the early exit. An investigation that finds nothing to do FINISHES
 * the case: the Outcome form is not offered, and the case may be closed without one. An
 * investigation that finds there is something to do leaves the case open until the Outcome is
 * recorded. Getting that backwards either blocks a closed case for ever or lets a real one be
 * shut with no finding on it.
 *
 * Pure and importless, because the drill-down, the status control and the server action all
 * have to agree about which stage a case is at and there must be one answer.
 */

export type IncidentStage = "reported" | "investigated" | "answered";

export type IncidentCaseState = {
  /** Set when the Investigation form has been filed. */
  investigationCompleted: string | null;
  /** From the investigation: true when it found nothing further to do. Null before it. */
  noFurtherAction: boolean | null;
  /** Set when the Outcome form has been filed. */
  outcomeRecordedOn: string | null;
};

/** How far the case has actually got. */
export function incidentStage(c: IncidentCaseState): IncidentStage {
  if (c.outcomeRecordedOn) return "answered";
  if (c.investigationCompleted) return "investigated";
  return "reported";
}

/** Is the Investigation form the next thing to do? */
export function investigationDue(c: IncidentCaseState): boolean {
  return !c.investigationCompleted;
}

/**
 * Is the Outcome form the next thing to do?
 *
 * Only after an investigation, only when that investigation said further action WAS required,
 * and only once. A case whose investigation answered "no further action" never reaches here.
 */
export function outcomeDue(c: IncidentCaseState): boolean {
  if (!c.investigationCompleted) return false;
  if (c.noFurtherAction === true) return false;
  return !c.outcomeRecordedOn;
}

/**
 * May this case be closed without anything being left undone?
 *
 * Two honest ways to be finished: the investigation found nothing further to do, or the
 * outcome has been recorded. Anything else is a case somebody is closing early -- which the
 * status control still permits, because a manager may have a reason we do not know, but the
 * screen says so rather than pretending.
 */
export function readyToClose(c: IncidentCaseState): boolean {
  if (c.noFurtherAction === true) return true;
  return !!c.outcomeRecordedOn;
}

/** One line saying what the case is waiting for, or null when it is not waiting. */
export function whatIsOutstanding(c: IncidentCaseState): string | null {
  if (investigationDue(c)) return "Investigation";
  if (outcomeDue(c)) return "Outcome";
  return null;
}
