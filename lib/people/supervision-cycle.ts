/**
 * Be Care Compliant — where the CURRENT supervision cycle begins.
 *
 * Pure and import free so it can be unit tested.
 *
 * WHY THIS EXISTS (Phil, 2026-09-16, comparing Vera Asanimor against the Monday board).
 * The cycle used to be split by counting: an appraisal ends a cycle of three, so with one
 * appraisal on file, three supervisions were assumed to belong to the cycle before it.
 * That only holds if the history is perfectly regular. Vera has one appraisal and three
 * supervisions, but only ONE of them came before it. The count said "three consumed", the
 * current cycle came out empty, and her record showed Supervision 1 as not yet done while
 * slots 2 and 3 displayed the two supervisions she had actually completed since. Every due
 * date hung off the wrong anchor as a result.
 *
 * Real history is not regular: a cycle gets four supervisions, or an appraisal runs late,
 * or a year of it arrives in one import. The date is the fact, so split on the date. A
 * supervision completed ON the day of the appraisal belongs to the cycle that appraisal
 * closes, not the one it opens.
 */

/**
 * How many of `sorted` (ascending ISO dates) belong to cycles already closed.
 * Everything from this index on is the current cycle.
 */
export function supervisionsConsumed(
  sorted: readonly string[],
  lastAppraisal: string | null,
): number {
  if (!lastAppraisal) return 0;
  let n = 0;
  for (const d of sorted) {
    if (d <= lastAppraisal) n += 1;
    else break;
  }
  return n;
}

/**
 * Which of the PREVIOUS cycle's completions belongs in slot `n`.
 *
 * The slots after the active one keep last cycle's date until they are redone, so the
 * record shows what was there before rather than three blanks. They were indexed by slot
 * number straight into the previous cycle's list, which only lines up when that cycle had
 * exactly `count` supervisions in it. Chloe Driscoll's previous cycle had two, so slot 3
 * asked for the third of two and got nothing: her record showed nothing where the board
 * showed 3 Apr 2026.
 *
 * A short previous cycle fills the LAST slots, because the run ends where the appraisal
 * closed it. Two completions in a cycle of three are slots 2 and 3, not 1 and 2.
 */
export function previousCycleAt(
  prev: readonly string[],
  n: number,
  count: number,
): string | null {
  const idx = prev.length - (count - n) - 1;
  return idx >= 0 && idx < prev.length ? prev[idx] : null;
}

