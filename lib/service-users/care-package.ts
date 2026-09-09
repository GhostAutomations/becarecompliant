/**
 * Be Care Compliant — the care package as it is agreed at the setup visit.
 *
 * WHY (Phil, 2026-09-09): "i want it done at setup visit so it isnt lost". The four fixed call
 * slots this replaces could not say what a real package says — more than four calls, a Tuesday
 * only sitting service, a shop on a Friday — and everything they could not say was lost
 * between the visit and somebody typing the weekly grid.
 *
 * THE SHAPE IS THE SECTOR'S, not an invention. Birdie models a client's care as a repeating
 * VISIT SCHEDULE: which days, which time block, how long, how many carers, what service. Its
 * time blocks are Morning, Lunch, Afternoon, Evening and Night, and it caps carers at four. A
 * one-off is the same object over a single day. This is that, minus the parts that belong to
 * rostering rather than to billing: no clock times, no carer allocation, no runs.
 *
 * ONE LINE IS ONE RECURRING CALL. "45 minutes, two carers, every morning" is a line. "An hour
 * of shopping on Fridays" is another. A package is however many lines it takes, and the days
 * are ticked per line, so no two days have to be alike.
 *
 * WHAT IT IS NOT: week 1 / week 2. The care plan stores a day of the week and nothing else, so
 * alternating weeks would mean changing the table, the billing maths, the recurring invoice
 * cron and the grid. Logged as a known gap (Phil, 2026-09-09: "later, and log it").
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

/** Birdie's five, and for the same reason: a call is booked to part of a day, not to a clock. */
export const CALL_SLOTS = [
  { value: "morning", label: "Morning", hint: "06:00 – 11:00" },
  { value: "lunch", label: "Lunch", hint: "11:00 – 14:00" },
  { value: "afternoon", label: "Afternoon", hint: "14:00 – 18:00" },
  { value: "evening", label: "Evening", hint: "18:00 – 22:00" },
  { value: "night", label: "Night", hint: "22:00 – 06:00" },
] as const;

export type CallSlot = (typeof CALL_SLOTS)[number]["value"];

const SLOT_ORDER: Record<string, number> = Object.fromEntries(
  CALL_SLOTS.map((s, i) => [s.value, i]),
);

/** Monday first, matching care_plan_entries.day_of_week where 0 = Monday. */
export const PACKAGE_DAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

/** One recurring call in the package. */
export type PackageLine = {
  /** A Care Plan service: Care, Sit, Overnight, Sleep, Shopping, Cleaning. */
  service: string;
  /** Days of the week it happens on, 0 = Monday. */
  days: number[];
  slot: CallSlot;
  /** A Care Plan unit: 15m, 30m, 1hr … Fixed. */
  unit: string;
  /** 1 to 4. */
  carers: number;
};

/** A row of the weekly Care Plan, in the shape care_plan_entries stores. */
export type PackageRow = {
  day_of_week: number;
  service: string;
  unit: string;
  slot: CallSlot;
  carers: number;
  quantity: number;
  position: number;
};

const MAX_LINES = 20;

function clampCarers(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 4) : 1;
}

/**
 * Read a package out of a stored answer, keeping only what is usable.
 *
 * Deliberately forgiving of shape and unforgiving of content: the answer arrives as JSON from a
 * browser and is validated against the STORED schema on the server, so anything that is not a
 * real service, a real unit, a real slot or a real day is dropped rather than trusted. A line
 * with no days is not a call and does not survive.
 */
export function parsePackage(
  value: unknown,
  opts: { services: readonly string[]; units: readonly string[] },
): PackageLine[] {
  const raw = Array.isArray(value) ? value : [];
  const lines: PackageLine[] = [];
  for (const item of raw.slice(0, MAX_LINES)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;

    const service = String(o.service ?? "").trim();
    if (!opts.services.includes(service)) continue;

    const unit = String(o.unit ?? "").trim();
    if (!opts.units.includes(unit)) continue;

    const slot = String(o.slot ?? "").trim();
    if (!(slot in SLOT_ORDER)) continue;

    const days = [
      ...new Set(
        (Array.isArray(o.days) ? o.days : [])
          .map((d) => Math.trunc(Number(d)))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b);
    if (days.length === 0) continue;

    lines.push({ service, days, slot: slot as CallSlot, unit, carers: clampCarers(o.carers) });
  }
  return lines;
}

/**
 * The weekly Care Plan a package makes: one row per call per day it happens on.
 *
 * Ordered by DAY, then by the time of day, then by the order the lines were written, so the
 * grid reads down the week in the order the calls actually happen rather than in whatever order
 * somebody typed them. `position` is that order.
 */
export function packageRows(lines: ReadonlyArray<PackageLine>): PackageRow[] {
  const calls = lines.flatMap((line, index) => line.days.map((day) => ({ day, index, line })));
  calls.sort(
    (a, b) =>
      a.day - b.day ||
      (SLOT_ORDER[a.line.slot] ?? 99) - (SLOT_ORDER[b.line.slot] ?? 99) ||
      a.index - b.index,
  );
  return calls.map(({ day, line }, position) => ({
    day_of_week: day,
    service: line.service,
    unit: line.unit,
    slot: line.slot,
    carers: line.carers,
    quantity: 1,
    position,
  }));
}

/** How many calls a week the package is, for the screen and the audit trail. */
export function callsPerWeek(lines: ReadonlyArray<PackageLine>): number {
  return lines.reduce((total, l) => total + l.days.length, 0);
}

/** One readable line: "Care 45m, 2 carers, morning, Mon Tue Wed Thu Fri Sat Sun". */
export function describeLine(line: PackageLine): string {
  const slot = CALL_SLOTS.find((s) => s.value === line.slot)?.label ?? line.slot;
  const days =
    line.days.length === 7
      ? "every day"
      : line.days.map((d) => PACKAGE_DAYS[d]?.label ?? String(d)).join(" ");
  const carers = line.carers === 1 ? "1 carer" : `${line.carers} carers`;
  return `${line.service} ${line.unit}, ${carers}, ${slot.toLowerCase()}, ${days}`;
}

/** The whole package in words, for the audit trail. */
export function describePackage(lines: ReadonlyArray<PackageLine>): string {
  if (lines.length === 0) return "no calls";
  return lines.map(describeLine).join("; ");
}
