/**
 * The order of the Absence page (Phil, 2026-10-06: "anything below threshold is down below and
 * anything requiring action is higher up"). Pure, so it is tested on its own.
 *
 *   0  A meeting is due and nothing is booked (or the invitation was declined): book it.
 *   1  A meeting is booked and waiting to be held or recorded.
 *   2  At a stage, but its meeting is done: nothing to do until the next absence.
 *   3  Below threshold.
 *
 * Inside a group the higher stage (or Bradford score) comes first, then the order the rows
 * arrived in, which is by surname. The sort is stable, so that order is kept.
 */
export type RankInput = {
  derivedStage: number | null;
  derivedLabel: string | null;
  meetingDue: boolean;
  bradfordScore: number;
  booking: { response?: string | null } | null;
};

export function absenceRank(r: RankInput): number {
  const declined = r.booking?.response === "declined";
  if (r.meetingDue && (!r.booking || declined)) return 0;
  if (r.booking && !declined) return 1;
  if (r.derivedLabel) return 2;
  return 3;
}

export function rankAbsenceRows<T>(rows: T[], input: (row: T) => RankInput): T[] {
  return rows
    .map((row, i) => ({ row, i, k: input(row) }))
    .sort(
      (a, b) =>
        absenceRank(a.k) - absenceRank(b.k) ||
        (b.k.derivedStage ?? 0) - (a.k.derivedStage ?? 0) ||
        b.k.bradfordScore - a.k.bradfordScore ||
        a.i - b.i,
    )
    .map((x) => x.row);
}
