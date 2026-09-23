/**
 * Be Care Compliant — checks WAITING on an earlier check, said in plain words.
 *
 * Operation Thistle item 10 (Phil, 2026-09-23). The readiness page counted every check with no
 * due date as a gap. Most were not: an Annual Appraisal on "after Supervision 3" has no date
 * until Supervision 3 is done, a supervision after Supervision 3 has none until the appraisal,
 * and a new starter's first supervision has none until probation is signed off. Each is waiting
 * for something that has not happened yet, which is the truth, and "no due date" made it read
 * like a mistake. Phil chose to show them as waiting, separately, saying what each waits for.
 *
 * The counts come from get_framework_check_readiness (migration 0321). This only words them.
 * Pure and importless so it can be unit tested.
 */

export type WaitingCounts = {
  /** Annual Appraisals on "after Supervision 3", waiting for Supervision 3. */
  sup3: number;
  /** Supervisions waiting for the appraisal that starts the next cycle. */
  appraisal: number;
  /** A new starter's first supervision, waiting for probation to be signed off. */
  probation: number;
};

export const NO_WAITING: WaitingCounts = { sup3: 0, appraisal: 0, probation: 0 };

export function waitingTotal(w: WaitingCounts): number {
  return w.sup3 + w.appraisal + w.probation;
}

/** "5 appraisals waiting for Supervision 3, 1 supervision waiting for an appraisal, ..." */
export function waitingParts(w: WaitingCounts): string[] {
  const parts: string[] = [];
  if (w.sup3 > 0) {
    parts.push(`${w.sup3} ${w.sup3 === 1 ? "appraisal" : "appraisals"} waiting for Supervision 3`);
  }
  if (w.appraisal > 0) {
    parts.push(
      `${w.appraisal} ${w.appraisal === 1 ? "supervision" : "supervisions"} waiting for an appraisal`,
    );
  }
  if (w.probation > 0) {
    parts.push(
      `${w.probation} ${w.probation === 1 ? "supervision" : "supervisions"} waiting for probation to be signed off`,
    );
  }
  return parts;
}

/**
 * The whole line for the readiness page, or null when nothing is waiting.
 * "8 checks are waiting on an earlier check, so they are not counted here: 5 appraisals ..."
 */
export function waitingSentence(w: WaitingCounts): string | null {
  const total = waitingTotal(w);
  if (total === 0) return null;
  const head =
    total === 1
      ? "1 check is waiting on an earlier check, so it is not counted here"
      : `${total} checks are waiting on an earlier check, so they are not counted here`;
  return `${head}: ${waitingParts(w).join(", ")}.`;
}
