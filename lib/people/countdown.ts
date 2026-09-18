/**
 * Be Care Compliant — how long is left on the supervision that is due.
 *
 * WHY (Phil, 2026-09-18): "Change Due now to a day count down." The gold box on the
 * supervision card said "Due now", which was true of every one of them in turn and told a
 * manager nothing about urgency: Asim's Supervision 3 is the one to do next AND is not due
 * for weeks, and those are two different conversations to have with him.
 *
 * Whole days, on the London calendar date, so a supervision due tomorrow reads "1 day"
 * from the moment the day turns rather than from a time of day nobody set.
 *
 * Pure and importless so it can be tested.
 */

/** Whole days from one ISO date to another. Positive = the second is later. */
function daysApart(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86400000);
}

/**
 * The countdown to a due date, as a short phrase, or null when there is nothing to count
 * to. Late is counted the same way and SAID: a box reading "5 days" while the deadline
 * went last week would be the most misleading thing on the record.
 */
export function dueCountdown(dueIso: string | null | undefined, todayIso: string): string | null {
  if (!dueIso || !/^\d{4}-\d{2}-\d{2}$/.test(dueIso)) return null;
  const days = daysApart(todayIso, dueIso);
  if (days === 0) return "Due today";
  if (days > 0) return days === 1 ? "1 day" : `${days} days`;
  const late = Math.abs(days);
  return late === 1 ? "1 day late" : `${late} days late`;
}
