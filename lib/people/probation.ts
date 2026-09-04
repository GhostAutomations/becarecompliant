/**
 * Be Care Compliant — the company probationary period.
 *
 * A probation period is written in the words of the employment contract: "12 weeks",
 * "3 months", "90 days". A month is NOT thirty days (three months from 30 November
 * is 28 February), so the UNIT is stored alongside the number rather than flattened
 * into days. This module is pure and self-contained so it can be unit tested; the
 * date itself is worked out in lib/people/logic.ts by the shared recurrence engine,
 * which this module feeds.
 */

export type ProbationUnit = "day" | "week" | "month";
export type ProbationPeriod = { value: number; unit: ProbationUnit };

/** What a company gets before anyone changes it. */
export const DEFAULT_PROBATION: ProbationPeriod = { value: 3, unit: "month" };

/** The unit dropdown, in the order it is shown. */
export const PROBATION_UNITS: ReadonlyArray<{ unit: ProbationUnit; label: string }> = [
  { unit: "day", label: "Days" },
  { unit: "week", label: "Weeks" },
  { unit: "month", label: "Months" },
];

/** The longest period that can be meant in each unit. A typo of 90 in the Months box
 *  would otherwise set a probation ending in 2033. */
const MAX_BY_UNIT: Record<ProbationUnit, number> = { day: 730, week: 104, month: 24 };

export function isProbationUnit(v: unknown): v is ProbationUnit {
  return v === "day" || v === "week" || v === "month";
}

/** "3 months", "1 month", "12 weeks", "90 days". Singular when the value is one. */
export function probationLabel(period: ProbationPeriod): string {
  return `${period.value} ${period.value === 1 ? period.unit : `${period.unit}s`}`;
}

/**
 * Read a stored row into a period. Falls back to the default rather than throwing:
 * a row that predates the unit column, or one somehow out of range, must never stop
 * a settings page rendering.
 */
export function probationFrom(value: unknown, unit: unknown): ProbationPeriod {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PROBATION;
  if (!isProbationUnit(unit)) return DEFAULT_PROBATION;
  if (n > MAX_BY_UNIT[unit]) return DEFAULT_PROBATION;
  return { value: n, unit };
}

/** Validate what an admin typed. Returns the period or the message to show them. */
export function parseProbationPeriod(
  value: unknown,
  unit: unknown,
): { period: ProbationPeriod } | { error: string } {
  if (!isProbationUnit(unit)) return { error: "Choose days, weeks or months." };
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(n) || n < 1) return { error: "Enter a number of days, weeks or months." };
  if (n > MAX_BY_UNIT[unit]) {
    return { error: `A probation period cannot be longer than ${MAX_BY_UNIT[unit]} ${unit}s.` };
  }
  return { period: { value: n, unit } };
}

/**
 * The period as the recurrence engine reads it. Weeks are exactly seven days;
 * months are calendar months and the engine clamps a 31st to the end of a short
 * month, which is why months are not converted here.
 */
export function probationToRecurrence(period: ProbationPeriod): {
  frequency: ProbationUnit;
  interval: number;
} {
  return { frequency: period.unit, interval: period.value };
}
