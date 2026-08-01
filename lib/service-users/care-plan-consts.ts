// Shared, pure constants for the weekly care plan (client + server safe).

export const CARE_PLAN_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const CARE_PLAN_SERVICES = [
  "Care",
  "Sit",
  "Overnight",
  "Sleep",
  "Shopping",
  "Cleaning",
] as const;

export const CARE_PLAN_UNITS = [
  "15m",
  "30m",
  "45m",
  "1hr",
  "2hr",
  "3hr",
  "4hr",
  "5hr",
  "6hr",
  "7hr",
  "8hr",
  "9hr",
  "10hr",
  "11hr",
  "12hr",
  "Fixed",
] as const;

export const HANDED_OPTIONS = [
  { value: "single", label: "Single handed" },
  { value: "double", label: "Double handed" },
] as const;

export type CarePlanEntry = {
  id: string;
  day_of_week: number; // 0 = Monday
  service: string;
  unit: string;
  handed: string; // 'single' | 'double'
  quantity: number;
  position: number;
};

/** Hours each unit represents. Fixed is a flat fee (null hours). */
export const UNIT_HOURS: Record<string, number | null> = {
  "15m": 0.25,
  "30m": 0.5,
  "45m": 0.75,
  "1hr": 1,
  "2hr": 2,
  "3hr": 3,
  "4hr": 4,
  "5hr": 5,
  "6hr": 6,
  "7hr": 7,
  "8hr": 8,
  "9hr": 9,
  "10hr": 10,
  "11hr": 11,
  "12hr": 12,
  Fixed: null,
};

/** A service and its two rates (pence), keyed by the service label ("Care" etc). */
export type ServiceRate = { label: string; hourly_pence: number; fixed_pence: number };

/** Price of ONE unit of a service, ROUNDED to the penny. Fixed rate for Fixed, else hourly x
 *  hours, doubled for double handed. Kept for anywhere a whole penny figure is wanted; the
 *  invoice itself prints unitPriceExactPence below, because £6.38 does not multiply out. */
export function unitPricePence(
  rate: ServiceRate | undefined,
  unit: string,
  handed: string = "single",
): number {
  if (!rate) return 0;
  const base = unit === "Fixed" ? rate.fixed_pence : Math.round(rate.hourly_pence * (UNIT_HOURS[unit] ?? 0));
  return handed === "double" ? base * 2 : base;
}

/**
 * The UNROUNDED price of one unit, in pence, so an invoice can print a figure that multiplies
 * out. A quarter hour of £25.50 an hour is 637.5 pence, not 638.
 *
 * WHY THIS EXISTS (2026-08-01). Phil asked why a line read 7 x 15m = £44.63 when the unit price
 * beside it said £6.38, which multiplies to £44.66. The amount was right: 1.75 hours at £25.50
 * is £44.625. The £6.38 was the lie, a display rounding of £6.375. Rather than charge the extra
 * three pence to make a rounded figure true, we print the figure that is true. 30m and 1hr
 * divide exactly, which is why this hid for so long.
 */
export function unitPriceExactPence(
  rate: ServiceRate | undefined,
  unit: string,
  handed: string = "single",
): number {
  if (!rate) return 0;
  const base = unit === "Fixed" ? rate.fixed_pence : rate.hourly_pence * (UNIT_HOURS[unit] ?? 0);
  return handed === "double" ? base * 2 : base;
}

/** EXACT line amount: quantity billed at the true rate, rounded only at the end
 *  (so e.g. 56 x 15m of £25.50/hr = £357.00, not 56 x £6.38). */
export function lineAmountPence(
  rate: ServiceRate | undefined,
  unit: string,
  handed: string,
  quantity: number,
): number {
  return Math.round(quantity * unitPriceExactPence(rate, unit, handed));
}
