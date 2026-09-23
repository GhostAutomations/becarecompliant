/**
 * Be Care Compliant — the unit a check's interval is stored in, for the Settings card.
 *
 * DEF-061 (2026-09-23). The Settings card asked "Every (days)" for every check and saved
 * frequency "day". The Audit is stored as every 3 MONTHS, so the card showed 3 and pressing
 * Save would have made it every 3 days, on People and Service Users, for every company that has
 * one. The card now says the unit the check is stored in and sends that unit back, and anything
 * unrecognised is treated as days, which is what the card always meant.
 *
 * Pure and importless so it can be unit tested.
 */

export type IntervalFrequency = "day" | "week" | "month" | "year";

const PLURAL: Record<IntervalFrequency, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

export function intervalUnit(frequency: string | null | undefined): {
  frequency: IntervalFrequency;
  plural: string;
} {
  const f: IntervalFrequency =
    frequency === "week" || frequency === "month" || frequency === "year" ? frequency : "day";
  return { frequency: f, plural: PLURAL[f] };
}
