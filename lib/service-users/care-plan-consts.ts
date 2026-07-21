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

/** Price of ONE unit of a service (rounded to the penny), for reference/display.
 *  Fixed rate for Fixed, else hourly x hours, doubled for double handed. */
export function unitPricePence(
  rate: ServiceRate | undefined,
  unit: string,
  handed: string = "single",
): number {
  if (!rate) return 0;
  const base = unit === "Fixed" ? rate.fixed_pence : Math.round(rate.hourly_pence * (UNIT_HOURS[unit] ?? 0));
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
  if (!rate) return 0;
  const mult = handed === "double" ? 2 : 1;
  const perUnit = unit === "Fixed" ? rate.fixed_pence : rate.hourly_pence * (UNIT_HOURS[unit] ?? 0);
  return Math.round(quantity * perUnit * mult);
}
