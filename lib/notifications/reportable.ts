/**
 * Be Care Compliant — what the daily People / Service User report is allowed to call
 * outstanding.
 *
 * The report used to take every check with a due date on or before today + 14 and list
 * anything in the past as overdue. The app already knew better, and said so in the check
 * status views: a one-off check that has been done is green. Nobody asked it. So every
 * completed Setup Visit was reported overdue every morning, ageing by a day each time --
 * Robert Owen's read 2053 days on a visit that happened.
 *
 * The test is not "is the date in the past". It is "is there still something to do".
 *
 * Deliberately NOT the same as filtering on the view's RAG: the report's horizon is 14
 * days and a check's amber window can be shorter than that, so a green row can be
 * genuinely due inside the horizon. This drops what is SETTLED and leaves the horizon
 * alone.
 *
 * Pure and importless so it can be tested.
 */

export type CheckRowState = {
  recurring: boolean;
  dueDate: string | null;
  lastCompletedOn: string | null;
};

/** True when the report should still be speaking about this check. */
export function reportableCheck(row: CheckRowState): boolean {
  if (!row.dueDate) return false;
  // A one-off that has been done is finished forever. Its due date stays where it was
  // (a Service User check keeps it, see complete_check), and it means nothing after the
  // day it was done.
  if (!row.recurring && row.lastCompletedOn) return false;
  /* A recurring check whose own completion has already met its due date is not overdue
     either: that deadline was discharged, and the next date has not been set yet. An
     appraisal scheduled after Supervision 3 sits exactly here -- due 03/07, done 03/07,
     and nothing due again until the next Supervision 3 is completed. */
  if (row.lastCompletedOn && row.dueDate <= row.lastCompletedOn) return false;
  return true;
}
