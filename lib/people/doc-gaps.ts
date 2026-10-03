/**
 * Be Care Compliant — a DBS or Right to Work that was never recorded (audit W1, Phil 2026-10-03).
 *
 * THE GAP. A person with no DBS and no Right to Work on file showed a green "Compliant" pill, a
 * green rollup and nothing on Readiness, because every reader only coloured a DATE: the DBS
 * renewal date and the Right to Work expiry. No date, no colour, so the most serious gap a care
 * company can have (somebody working without a DBS) was the one gap the product could not see.
 *
 * THE RULE (Phil, popup 2026-10-03: "Red from start date"):
 *   - DBS is missing when neither the certificate date nor the renewal date is recorded.
 *   - Right to Work is missing when neither the limits nor an expiry is recorded. "No limits" is
 *     itself an answer (rtw_limits = 'none'), so a British citizen with no expiry is NOT missing.
 *   - Missing counts from the person's start date: red from that day, nothing before it.
 *
 * ONE RULE, EVERY SCREEN. The record page, the People register, the People summary, the
 * dashboard tiles, the morning digest and Readiness all call missingDocuments(), so a person can
 * never be red on one screen and green on the next. Pure on purpose: no imports, unit tested.
 */

export type DocTracker = {
  dbs_date: string | null;
  enhanced_dbs_date: string | null;
  rtw_expiry_date: string | null;
  rtw_limits: string | null;
};

export type DocGapKind = "dbs_renewal" | "right_to_work";

export type DocGap = {
  kind: DocGapKind;
  /** What the row says, on screen and in the digest. */
  name: string;
  /** The day it became a gap: the person's start date. Used as the "due" date everywhere. */
  since: string;
};

/** What a missing document's cell says. */
export const NOT_RECORDED = "Not recorded";

const blank = (v: string | null | undefined) => !v || v.trim() === "";

export function dbsMissing(t: DocTracker | null | undefined): boolean {
  return !t || (blank(t.dbs_date) && blank(t.enhanced_dbs_date));
}

export function rtwMissing(t: DocTracker | null | undefined): boolean {
  return !t || (blank(t.rtw_limits) && blank(t.rtw_expiry_date));
}

/** Started on or before today. No start date reads as started: the record is live. */
export function hasStarted(startDate: string | null | undefined, todayIso: string): boolean {
  return blank(startDate) || (startDate as string) <= todayIso;
}

/**
 * The documents this person is working without, today. Empty before their start date, and empty
 * once both are on file. Leavers and archived records are the caller's to leave out, exactly as
 * every register already does.
 */
export function missingDocuments(
  t: DocTracker | null | undefined,
  startDate: string | null | undefined,
  todayIso: string,
): DocGap[] {
  if (!hasStarted(startDate, todayIso)) return [];
  const since = blank(startDate) ? todayIso : (startDate as string);
  const out: DocGap[] = [];
  if (dbsMissing(t)) out.push({ kind: "dbs_renewal", name: "DBS not recorded", since });
  if (rtwMissing(t)) out.push({ kind: "right_to_work", name: "Right to Work not recorded", since });
  return out;
}
