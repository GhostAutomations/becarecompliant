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

/**
 * How many carers a call needs (Phil, 2026-09-09: "a number, 1 to 4", which is what Birdie
 * does — a double up is just the count being 2).
 *
 * Three and four carer calls are rare but real — a hoist plus a second pair of hands, a
 * bariatric package — and an agency running one previously had to bill for two and eat the
 * third. `carers` is what PRICES a line now; `handed` stays as the single/double word the
 * older screens print, derived from it.
 */
export const CARERS_OPTIONS = [
  { value: 1, label: "1 carer" },
  { value: 2, label: "2 carers (double handed)" },
  { value: 3, label: "3 carers" },
  { value: 4, label: "4 carers" },
] as const;

export const MAX_CARERS = 4;

/** Read a carer count off anything: a stored number, a legacy handed word, rubbish. */
export function carersOf(carers: unknown, handed?: unknown): number {
  const n = Math.trunc(Number(carers));
  if (Number.isFinite(n) && n >= 1) return Math.min(n, MAX_CARERS);
  return handed === "double" ? 2 : 1;
}

/** The single/double word for a carer count, so screens that print handed stay true. */
export function handedFromCarers(carers: number): "single" | "double" {
  return carersOf(carers) >= 2 ? "double" : "single";
}

/** What an invoice line calls it. Two carers is "Double Handed" because that is what the
 *  sector says and what every existing invoice already prints; three and four are counted. */
export function carersLabel(carers: number): string {
  const n = carersOf(carers);
  if (n === 1) return "Single Handed";
  if (n === 2) return "Double Handed";
  return `${n} Carers`;
}

export type CarePlanEntry = {
  id: string;
  day_of_week: number; // 0 = Monday
  service: string;
  unit: string;
  handed: string; // 'single' | 'double', derived from carers
  /** How many carers the call needs, 1 to 4. This is what prices the line. */
  carers: number;
  /** Which part of the day the call is: morning, lunch, afternoon, evening, night. Null on
   *  rows written before the setup visit started asking. Billing ignores it. */
  slot: string | null;
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

/**
 * Price of ONE unit of a service, rounded to the penny. THE price: what the invoice prints and
 * what the line is charged at. Fixed rate for Fixed, else hourly x hours, doubled for double
 * handed, the rounding happening BEFORE the doubling so the printed figure is the billed one.
 */
export function unitPricePence(
  rate: ServiceRate | undefined,
  unit: string,
  handed: string = "single",
): number {
  return unitPriceForCarers(rate, unit, handed === "double" ? 2 : 1);
}

/**
 * The same price, said in carers rather than in single/double. THE one place the multiplier
 * lives: unitPricePence delegates here rather than repeating the arithmetic, for exactly the
 * reason lineAmountPence does — a second copy is how the recurring cron drifted away from the
 * builder and billed £89.32 where the builder billed £89.25.
 *
 * The rounding still happens BEFORE the multiplication, so the printed rate times the carers
 * is the billed figure and a client can reproduce it with a calculator.
 */
export function unitPriceForCarers(
  rate: ServiceRate | undefined,
  unit: string,
  carers: number,
): number {
  if (!rate) return 0;
  const base = unit === "Fixed" ? rate.fixed_pence : Math.round(rate.hourly_pence * (UNIT_HOURS[unit] ?? 0));
  return base * carersOf(carers);
}

/**
 * Line amount: QUANTITY x THE PRINTED UNIT PRICE.
 *
 * PHIL'S CALL, 2026-08-01, arrived at the long way round. A quarter hour of £25.50 is £6.375.
 * Billing at the true rate and rounding once at the end gave 7 x 15m = £44.63, which is
 * arithmetically purer and which a client cannot check: the invoice now prints a rate, and
 * 7 x £6.38 is £44.66. Printing £6.375 was tried and rejected as looking like a spreadsheet
 * artefact on a care invoice. So the rate is rounded to the penny, the line is charged at the
 * rounded rate, and every figure on the document is one a client can reproduce with a
 * calculator. It costs a few pence a line on quarter hour visits, in the provider's favour.
 * 30m (£12.75) and 1hr (£25.50) divide exactly and are untouched.
 *
 * ONE maths path, deliberately: this delegates to unitPricePence rather than repeating the
 * arithmetic. A second copy is exactly how the recurring cron drifted away from the builder and
 * billed £89.32 where the builder billed £89.25.
 */
export function lineAmountPence(
  rate: ServiceRate | undefined,
  unit: string,
  handed: string,
  quantity: number,
): number {
  return Math.round(quantity * unitPricePence(rate, unit, handed));
}

/** Line amount for a carer count. Same one maths path. */
export function lineAmountForCarers(
  rate: ServiceRate | undefined,
  unit: string,
  carers: number,
  quantity: number,
): number {
  return Math.round(quantity * unitPriceForCarers(rate, unit, carers));
}
