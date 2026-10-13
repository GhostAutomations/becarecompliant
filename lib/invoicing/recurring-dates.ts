/**
 * Be Care Compliant — dates for a recurring invoice that repeats fixed lines (Phil, 2026-10-13,
 * popup "One per day, only when it fits exactly"). When the number of lines equals the number of
 * days in the billing period (Thistle: 7 Sleep lines, a 7 day week), line 1 is the first day, line 2
 * the next, and so on. Any other pattern stays undated rather than guessed.
 * Pure and importless, so node --test runs it.
 */

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Days from `from` to `to` inclusive; 0 when the range is not valid. */
export function daysInPeriod(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** A date for each line, one per day from `from`, or all null when it does not fit exactly. */
export function onePerDayDates(lineCount: number, from: string, to: string): (string | null)[] {
  const days = daysInPeriod(from, to);
  if (lineCount <= 0 || days !== lineCount) return Array.from({ length: Math.max(0, lineCount) }, () => null);
  return Array.from({ length: lineCount }, (_, i) => addDays(from, i));
}
