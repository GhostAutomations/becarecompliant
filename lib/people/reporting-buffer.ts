/**
 * Be Care Compliant — the slack between when a check is PLANNED and when it is DUE
 * TO BE REPORTED.
 *
 * Two numbers on a check do two jobs: the interval is when the office plans to do it,
 * the reporting deadline is what the on time report grades against. Planning a
 * supervision every 80 days against a 90 day deadline gives a ten day buffer, so a
 * visit that slips a week is still an on time return. That buffer is the whole point
 * of having two numbers, and nothing on screen ever said what it was (Phil, 2026-09-05:
 * "have a note somewhere that there is a 10 buffer, if they change 80 to 85 then the
 * buffer changes to 5 days").
 *
 * It is a BUFFER, in his words. Not "slack", which is not the term used here.
 *
 * It also catches the setting that cannot work: a deadline EARLIER than the planned
 * cadence means every completion is late before anyone starts.
 *
 * Pure and self-contained (no runtime imports) so it can be unit tested.
 */

export type BufferTone = "buffer" | "none" | "over";

export type BufferNote = { tone: BufferTone; days: number; text: string };

/** Days between the planned cadence and the reporting deadline. Negative when the
 *  deadline lands first. Null when either number is missing or not usable. */
export function reportingBuffer(
  intervalDays: number | null | undefined,
  reportingDays: number | null | undefined,
): number | null {
  if (!Number.isInteger(intervalDays ?? NaN) || (intervalDays as number) < 1) return null;
  if (!Number.isInteger(reportingDays ?? NaN) || (reportingDays as number) < 1) return null;
  return (reportingDays as number) - (intervalDays as number);
}

const plural = (n: number) => (n === 1 ? "day" : "days");

/** What to say under the two boxes. Null when there is no deadline to compare against,
 *  which is the normal case for a check graded on its own cadence. */
export function bufferNote(
  intervalDays: number | null | undefined,
  reportingDays: number | null | undefined,
): BufferNote | null {
  const buffer = reportingBuffer(intervalDays, reportingDays);
  if (buffer === null) return null;
  const every = intervalDays as number;
  const deadline = reportingDays as number;

  if (buffer > 0) {
    return {
      tone: "buffer",
      days: buffer,
      text: `Planned every ${every} ${plural(every)} against a ${deadline} day reporting deadline: a ${buffer} day buffer before it counts as late.`,
    };
  }
  if (buffer === 0) {
    return {
      tone: "none",
      days: 0,
      text: `No buffer: the plan and the reporting deadline are both ${every} ${plural(every)}, so a completion one day late is a late report.`,
    };
  }
  return {
    tone: "over",
    days: buffer,
    text: `The reporting deadline of ${deadline} ${plural(deadline)} is sooner than the planned ${every} ${plural(every)}, so every completion counts as late. Plan it inside the deadline.`,
  };
}
