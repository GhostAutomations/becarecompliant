/**
 * Be Care Compliant: a new absence after a stage meeting makes the next stage due (Phil,
 * 2026-10-07: "there are people in tracking that are due action but not been moved into further
 * action ... new absences only" and "Next stage meeting due").
 *
 * The count alone missed them. After a Stage 1 meeting, older absences drop out of the rolling
 * window (or were discounted at the meeting), so somebody could be off again and still sit below
 * the Stage 2 count, filed under Tracking as if nothing had happened. While a stage has been
 * dealt with and the person is off again after it, the next stage is what a manager acts on.
 *
 * Pure, no imports, so it is tested on its own.
 */

/**
 * The stage due because of an absence since the last meeting, or null when there is none.
 *
 * @param meetingStage          the highest stage held or booked inside the window, or null
 * @param absencesSinceMeeting  counted absences that began after the last RECORDED meeting
 * @param stages                the company's stage numbers (e.g. [1, 2, 3, 4])
 */
export function stageDueAfterNewAbsence(
  meetingStage: number | null,
  absencesSinceMeeting: number,
  stages: readonly number[],
): number | null {
  if (meetingStage == null || absencesSinceMeeting <= 0) return null;
  const next = stages.filter((s) => s > meetingStage).sort((a, b) => a - b)[0];
  return next ?? null;
}
