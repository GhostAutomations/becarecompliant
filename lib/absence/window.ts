/**
 * Be Care Compliant — the absence rolling window.
 *
 * A policy says "three absences in a rolling twelve month period", not "in 365 days",
 * and the two are not the same: a twelve month window from 29 February lands on 28
 * February, and every year with a leap day is 366 days long. The window is a NUMBER
 * and a UNIT, and the database builds the interval from both, so the window a company
 * writes down is the window that is applied.
 *
 * Pure and self-contained (no runtime imports) so it can be unit tested. Deliberately
 * separate from lib/people/probation.ts: the two have different defaults, different
 * ceilings and different words, and the test runner cannot resolve a shared import.
 */

export type WindowUnit = "day" | "week" | "month";
export type AbsenceWindow = { value: number; unit: WindowUnit };

/** A rolling six months (Phil, 2026-09-04). Twelve is the longest window in common
 *  use; six is the one that actually catches a pattern while it can still be helped. */
export const DEFAULT_ABSENCE_WINDOW: AbsenceWindow = { value: 6, unit: "month" };

/** The unit dropdown, in the order it is shown. */
export const WINDOW_UNITS: ReadonlyArray<{ unit: WindowUnit; label: string }> = [
  { unit: "day", label: "Days" },
  { unit: "week", label: "Weeks" },
  { unit: "month", label: "Months" },
];

/** Five years in each unit: beyond that it is not a rolling window, it is a career. */
const MAX_BY_UNIT: Record<WindowUnit, number> = { day: 1825, week: 260, month: 60 };

export function isWindowUnit(v: unknown): v is WindowUnit {
  return v === "day" || v === "week" || v === "month";
}

/** "12 months", "1 month", "52 weeks", "365 days". */
export function windowLabel(w: AbsenceWindow): string {
  return `${w.value} ${w.value === 1 ? w.unit : `${w.unit}s`}`;
}

/** Read a stored row. Falls back to the default rather than throwing, so a row that
 *  predates the unit column can never stop the absence screens rendering. */
export function absenceWindowFrom(value: unknown, unit: unknown): AbsenceWindow {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_ABSENCE_WINDOW;
  if (!isWindowUnit(unit)) return DEFAULT_ABSENCE_WINDOW;
  if (n > MAX_BY_UNIT[unit]) return DEFAULT_ABSENCE_WINDOW;
  return { value: n, unit };
}

/** Validate what an admin typed, or what AI read out of a policy. */
export function parseAbsenceWindow(
  value: unknown,
  unit: unknown,
): { window: AbsenceWindow } | { error: string } {
  if (!isWindowUnit(unit)) return { error: "Choose days, weeks or months." };
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(n) || n < 1) {
    return { error: "Enter the rolling window as a number of days, weeks or months." };
  }
  if (n > MAX_BY_UNIT[unit]) {
    return { error: `A rolling window cannot be longer than ${MAX_BY_UNIT[unit]} ${unit}s.` };
  }
  return { window: { value: n, unit } };
}

/**
 * A window given in days converted to the unit that says the same thing, used once to
 * read the old days-only column and to make sense of a policy that talks in days.
 * 365 is a year, 730 two years; anything else stays as days, because it was chosen.
 * Note this converts what was WRITTEN, not what is DEFAULT: 365 days becomes twelve
 * months even though a new company now starts at six.
 */
export function windowFromDays(days: unknown): AbsenceWindow {
  const n = typeof days === "number" ? days : Number.parseInt(String(days ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_ABSENCE_WINDOW;
  if (n === 365) return { value: 12, unit: "month" };
  if (n === 730) return { value: 24, unit: "month" };
  if (n % 7 === 0 && n / 7 <= MAX_BY_UNIT.week) return { value: n / 7, unit: "week" };
  if (n > MAX_BY_UNIT.day) return DEFAULT_ABSENCE_WINDOW;
  return { value: n, unit: "day" };
}
