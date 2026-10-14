/**
 * Be Care Compliant — the Annual Appraisal columns (Due and Done) on the People register, the
 * record's appraisal tile, the summary and the register report.
 *
 * Pure and import free apart from other pure modules, so node --test can load it. It lived in
 * lib/people/logic.ts, which imports through path aliases and cannot be unit tested; logic.ts
 * re-exports it so every caller is unchanged.
 *
 * SPLIT ON THE DATE, NOT ON A COUNT (Phil, 2026-10-14, THE LIST 58). This assumed every appraisal
 * closed exactly three supervisions (`3 * appraisals`). A Newport carer had two ad hoc supervisions
 * in the cycle before her appraisal, so five came before it; the count put her current cycle at
 * the wrong supervision, and the register showed the appraisal due on her Supervision 2 date, in
 * red, with Done blank. The supervision columns already split on the date (supervisionsConsumed);
 * this now uses the same function, so the two halves of the row agree.
 */

import { addInterval, formatCivilDate, parseCivilDate, ragStatus, todayInLondon } from "../recurrence.ts";
import type { CivilDate, Rag } from "../recurrence.ts";
import { supervisionsConsumed } from "./supervision-cycle.ts";
import { appraisalDueMet, appraisalDoneShown } from "./appraisal-due.ts";

export type AppraisalSlot = {
  /** When the NEXT appraisal is due: the current cycle's Sup 3 completion + interval,
   *  or null until three supervisions are done in the current cycle. */
  nextDue: string | null;
  nextDueRag: Rag | "none";
  /** The last completed appraisal date, or null. */
  comp: string | null;
  /** Pill for the completed appraisal: green if it was done on/before the due it was
   *  set against (the last supervision before it + interval), red if late. */
  compRag: Rag | "none";
  /**
   * The stored due date is one the last appraisal already MET, so the cycle is closed.
   *
   * The Due cell then reads like a completed supervision slot: the date, plain, no pill. Without
   * this the row said red for overdue beside a green completed on the very same day.
   */
  nextDueMet: boolean;
  /** What the Done cell shows: empty while the next appraisal is due and not done (Phil's
   *  17 Sep rule). `comp` stays the last appraisal for everything else. */
  doneShown: string | null;
};

/**
 * The appraisal cycle slot (Phil, 2026-07-18): the appraisal is scheduled off the
 * supervision cycle (due after Sup 3), so its next due comes from the current cycle's
 * third supervision, and the completed appraisal is coloured on time (green) or late
 * (red) against the supervision that triggered it.
 */
export function appraisalSlot(
  appraisalCompDates: string[],
  supCompDates: string[],
  intervalDays: number | null,
  amberDays: number,
  today: CivilDate = todayInLondon(),
  /**
   * THE DATE IN THE SUPERVISION 3 DONE CELL, which is what the appraisal hangs off.
   *
   * Phil, 2026-09-17: "calculate the real appraisal due date 80 days after the supervison 3 done
   * date." That is the check's own schedule_mode, after_sup3, said plainly.
   *
   * It replaces a stored due date taken from the company's old system. That was this morning's
   * answer to "Annual Appraisal Due ... empty in bcc but not monday", and it pinned dates that
   * were already spent: Janet Oladunni's read 03/07/2026, the deadline her appraisal had MET, so
   * the register showed red for overdue beside a green completed on the same day. The column was
   * empty because the derivation below was wrong, not because the date was missing.
   *
   * Null when Supervision 3 has not been done in the current cycle: nothing anchors the appraisal
   * yet, and a blank is the truth rather than a date worked back from somewhere else.
   */
  thirdSupDone: string | null = null,
): AppraisalSlot {
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const hasInterval = !!intervalDays && intervalDays >= 1;
  const addI = (d: string) => formatCivilDate(addInterval(parseCivilDate(d), "day", intervalDays!));
  const appraisals = appraisalCompDates.filter(isDate).slice().sort();
  const comp = appraisals.length > 0 ? appraisals[appraisals.length - 1] : null;
  const sups = supCompDates.filter(isDate).slice().sort();
  // Supervisions on or before the last appraisal belong to cycles it has closed.
  const consumed = supervisionsConsumed(sups, comp);

  // Lateness of the last appraisal: judged against the last supervision before it (on the same
  // day counts, as the same meeting) + interval. None before it: nothing to judge against.
  let compRag: Rag | "none" = "none";
  if (comp) {
    const before = consumed > 0 ? sups[consumed - 1] : null;
    compRag = hasInterval && before ? (comp > addI(before) ? "red" : "green") : "green";
  }

  /*
   * The appraisal falls due one supervision interval after Supervision 3.
   *
   * The caller passes the date that is actually IN the Supervision 3 Done cell, so the register
   * reads across the row: the appraisal is due 80 days after the supervision the reader can see.
   * Where no caller supplied one (the backfill), it is the third supervision after the last
   * appraisal; fewer than three since then and nothing is due yet.
   */
  const currentCycleSups = sups.slice(consumed);
  const anchor = thirdSupDone && isDate(thirdSupDone)
    ? thirdSupDone
    : currentCycleSups.length >= 3
      ? currentCycleSups[2]
      : null;
  let nextDue: string | null = null;
  let nextDueRag: Rag | "none" = "none";
  if (hasInterval && anchor) nextDue = addI(anchor);

  // An appraisal done SINCE the supervision that set this deadline has discharged it, so the Due
  // cell carries no pill: Phil, "they have pills in them when they shouldnt as the text is green
  // in the done column". Pure and unit tested in appraisal-due.ts.
  const nextDueMet = appraisalDueMet(anchor, comp);
  if (nextDue && !nextDueMet) nextDueRag = ragStatus(parseCivilDate(nextDue), today, amberDays);

  return { nextDue, nextDueRag, comp, compRag, nextDueMet, doneShown: appraisalDoneShown(nextDue, nextDueMet, comp) };
}
