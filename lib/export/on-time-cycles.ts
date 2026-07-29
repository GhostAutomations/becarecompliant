/**
 * Be Care Compliant - the PQS cycle walk, pure and testable.
 *
 * Kept out of lib/export/on-time.ts on purpose: that module is "server-only" and talks to
 * Supabase, so the arithmetic that decides whether a company passes or fails a PQS measure could
 * not be unit tested there. This file has no imports beyond the date primitives.
 *
 * THE RULE. A check is due one interval after the last time it was done (or after the record
 * started, if it has never been done), and it keeps falling due every interval after that until
 * somebody does it. The report counts every one of those due dates, not just the first.
 *
 * WHY IT MATTERS (2026-07-30). The old walk took ONE due date per anchor. A record that had
 * never had the check done therefore owed exactly one cycle, and if that single date fell
 * outside the six month reporting window the record vanished from the measure completely. Live
 * example: Caerphilly had 13 of 14 staff who had never been supervised, 11 of whom started
 * before the window, so the report said "nothing was due". Newport1, whose staff started
 * recently enough for their one date to land inside the window, reported 0 percent. The branch
 * doing nothing scored better than the branch doing a little.
 */

// TYPE ONLY, so this module has no runtime import at all and node --test can load it without
// path aliases. The comparison is three integer compares; it is not worth a runtime dependency.
import type { CivilDate } from "@/lib/recurrence";

function compareCivil(a: CivilDate, b: CivilDate): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/**
 * Runaway backstop, nothing more.
 *
 * The loops below terminate on their own: `step` always advances (addInterval refuses an
 * interval below 1), so a gap ends at the next completion or at today. This only exists so a
 * future bug in `step` cannot hang a page. It is set far above anything reachable: a daily check
 * anchored in 1990 is about 13,000 cycles.
 *
 * It must never be small enough to bite in practice. An earlier version capped at 400 and kept
 * the OLDEST 400, which silently dropped the recent cycles the report window actually needs, so
 * a long running weekly check would have vanished from the measure exactly like the bug this
 * file was written to fix.
 */
export const MAX_CYCLES_PER_GAP = 50000;

/**
 * The anchor list for one record and one check: the origin, then every completion, ascending and
 * deduped.
 *
 * The origin is the record's start date, UNLESS evidence predates it, which data entry can
 * produce (live example: a start date of 01/08/2026 on a record with supervisions dated
 * 19/07/2026). In that case the earliest completion is the origin.
 *
 * Everything after the origin is a real completion, and that is the point. Only a completion may
 * close a cycle. Sorting the start date in among the completions would let it settle the cycle
 * before it, handing the record an on time credit and printing a completion date that no
 * evidence supports.
 *
 * Deduped, because two evidence rows on the same day would otherwise raise the same due date
 * twice, one of them credited on time.
 *
 * @param completionsAsc completion dates, already ascending.
 */
export function buildAnchors(start: CivilDate, completionsAsc: CivilDate[]): CivilDate[] {
  const first = completionsAsc[0];
  const anchors: CivilDate[] = [first && compareCivil(first, start) < 0 ? first : start];
  for (const c of completionsAsc) {
    if (compareCivil(c, anchors[anchors.length - 1]) <= 0) continue;
    anchors.push(c);
  }
  return anchors;
}

export type Gap = {
  /** The last completion, or the record's start date when it has never been done. */
  anchor: CivilDate;
  /**
   * The COMPLETION that closes this gap, or null while it is still open.
   *
   * Only a real completion belongs here. A record's start date must never be passed as `next`:
   * it would settle the previous cycle, hand the record an on time credit, and print a
   * completion date no evidence supports.
   */
  next: CivilDate | null;
  /** Today, in London civil terms. An open gap is only counted up to here. */
  today: CivilDate;
  /**
   * The earliest due date worth keeping, i.e. the report window start.
   *
   * Cycles before this are discarded as they are generated rather than collected and thrown away
   * later, so a check that has been outstanding for fifteen years costs a few thousand cheap
   * date steps and an array of only the cycles the window asked about.
   */
  from: CivilDate;
  /** anchor plus one interval, as the caller's recurrence rule defines it. */
  step: (from: CivilDate) => CivilDate;
};

/**
 * Every due date that fell in this gap.
 *
 * A completed gap always yields at least one: the completion settles it, early or late. Any
 * further cycle that came due BEFORE that completion was missed outright. An open gap yields
 * every due date already in the past; the cycle currently running is excluded because it is not
 * late yet.
 */
export function dueDatesInGap({ anchor, next, today, from, step }: Gap): CivilDate[] {
  const dues: CivilDate[] = [];
  // Due dates ascend, so dropping the ones before the window start removes a PREFIX. The last
  // entry is still the last cycle of the gap, which is what the on time attribution relies on.
  const keep = (d: CivilDate) => {
    if (compareCivil(d, from) >= 0) dues.push(d);
  };
  let due = step(anchor);

  if (next !== null) {
    keep(due);
    for (let guard = 0; guard < MAX_CYCLES_PER_GAP && compareCivil(due, next) < 0; guard++) {
      const nextDue = step(due);
      if (compareCivil(nextDue, next) >= 0) break;
      keep(nextDue);
      due = nextDue;
    }
    return dues;
  }

  // Strictly BEFORE today. A cycle due today has until the end of today, so it is not late yet
  // and counting it would fail every record whose check happens to fall due on the day the
  // report is run.
  for (let guard = 0; guard < MAX_CYCLES_PER_GAP && compareCivil(due, today) < 0; guard++) {
    keep(due);
    due = step(due);
  }
  return dues;
}

/**
 * Was the cycle at index `i` of `dues` met on time?
 *
 * Only the LAST cycle of a completed gap is the one the completion discharges. The ones before
 * it were never done at all, so they are late by definition and carry no completion date.
 */
export function cycleOnTime(
  dues: CivilDate[],
  i: number,
  next: CivilDate | null,
): { settled: boolean; onTime: boolean } {
  const settled = next !== null && i === dues.length - 1;
  return { settled, onTime: settled && compareCivil(next, dues[i]) <= 0 };
}
