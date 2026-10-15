/**
 * Be Care Compliant: the rota's working time warnings (Rota and Visits Stage 1, Phil 2026-10-15).
 *
 * Four warnings, never a block, from GOV.UK (checked 2026-10-15):
 *   - more than 48 hours a week on average, normally over 17 weeks, unless the person has opted
 *     out ("Signed the 48 hour opt out", ticked once by the office);
 *   - less than 11 hours rest between working days;
 *   - a shift over 6 hours with less than a 20 minute break;
 *   - no 24 hours off in the week, or 48 hours in the fortnight.
 *
 * Pure and importless, so node --test runs it. Times are instants (ISO strings with an offset or
 * Z, as Postgres returns timestamptz), so the clock change is already in them; the week and
 * fortnight boundaries are Monday 00:00 in Europe/London, worked out with Intl.
 */

export type ShiftSpan = {
  id: string;
  /** London civil date the shift belongs to (YYYY-MM-DD). */
  shiftDate: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
};

export type WorkingTimeKind = "weekly_hours" | "rest" | "break" | "day_off";
export type WorkingTimeWarning = { kind: WorkingTimeKind; text: string };

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Minutes worked on a shift: its length less its break (rest breaks are not working time). */
export function workedMinutes(s: ShiftSpan): number {
  const len = (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60_000;
  return Math.max(0, len - Math.max(0, s.breakMinutes || 0));
}

/** The UTC instant (ms) of a London wall clock time on a civil date. Clock change aware. */
export function londonWallToUtc(dateIso: string, hhmm = "00:00"): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // The offset London had at that moment, read back through Intl (twice, to settle on a change).
  let t = guess;
  for (let i = 0; i < 2; i += 1) t = guess - londonOffsetMs(t);
  return t;
}

function londonOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"));
  return asUtc - Math.floor(utcMs / 60_000) * 60_000;
}

/** Monday of the week a civil date falls in. */
export function mondayOfIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtHours(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** The longest stretch with no work between two instants (ms), given the shifts. */
function longestGapMs(spans: ShiftSpan[], fromMs: number, toMs: number): number {
  const busy = spans
    .map((s) => [Math.max(fromMs, Date.parse(s.startsAt)), Math.min(toMs, Date.parse(s.endsAt))] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let cursor = fromMs;
  let best = 0;
  for (const [a, b] of busy) {
    if (a > cursor) best = Math.max(best, a - cursor);
    cursor = Math.max(cursor, b);
  }
  return Math.max(best, toMs - cursor);
}

/**
 * Warnings for putting `candidate` on someone already working `existing` shifts (their other
 * active shifts, any status but cancelled). The candidate itself may also be in `existing`; it is
 * counted once.
 */
export function workingTimeWarnings(
  existing: ShiftSpan[],
  candidate: ShiftSpan,
  opts: { optedOut48: boolean },
): WorkingTimeWarning[] {
  const all = [...existing.filter((s) => s.id !== candidate.id), candidate];
  const out: WorkingTimeWarning[] = [];

  // 1. Break: over 6 hours on the shift with less than a 20 minute break.
  const lengthMin = (Date.parse(candidate.endsAt) - Date.parse(candidate.startsAt)) / 60_000;
  if (lengthMin > 360 && (candidate.breakMinutes || 0) < 20) {
    out.push({ kind: "break", text: `This shift is ${fmtHours(lengthMin)} hours with less than a 20 minute break.` });
  }

  // 2. Rest: under 11 hours between this shift and a shift on another day.
  const cs = Date.parse(candidate.startsAt);
  const ce = Date.parse(candidate.endsAt);
  for (const s of all) {
    if (s.id === candidate.id || s.shiftDate === candidate.shiftDate) continue;
    const ss = Date.parse(s.startsAt);
    const se = Date.parse(s.endsAt);
    const gap = se <= cs ? cs - se : ss >= ce ? ss - ce : 0;
    if (gap < 11 * HOUR) {
      out.push({
        kind: "rest",
        text: gap === 0
          ? "This shift overlaps another shift on a different day."
          : `Only ${fmtHours(gap / 60_000)} hours rest between this shift and the one on ${s.shiftDate}.`,
      });
      break;
    }
  }

  // 3. Weekly hours: over 48 on average across up to 17 weeks ending with this shift's week.
  //    Counted only over the weeks the rota has data for (from the first rostered week in the
  //    window), so a new rota is not averaged down by empty weeks it never planned.
  if (!opts.optedOut48) {
    const weekStart = mondayOfIso(candidate.shiftDate);
    const windowStart = addDaysIso(weekStart, -16 * 7);
    const windowEnd = addDaysIso(weekStart, 6);
    const inWindow = all.filter((s) => s.shiftDate >= windowStart && s.shiftDate <= windowEnd);
    const firstWeek = inWindow.reduce((m, s) => (mondayOfIso(s.shiftDate) < m ? mondayOfIso(s.shiftDate) : m), weekStart);
    const weeks = Math.round((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${firstWeek}T00:00:00Z`)) / (7 * DAY)) + 1;
    const total = inWindow.reduce((sum, s) => sum + workedMinutes(s), 0);
    const average = total / weeks;
    if (average > 48 * 60) {
      out.push({
        kind: "weekly_hours",
        text: `${fmtHours(average)} hours a week on average over ${weeks} week${weeks === 1 ? "" : "s"}, above 48, and no 48 hour opt out signed.`,
      });
    }
  }

  // 4. A day off: 24 hours clear in this week, or 48 hours clear across this and last week.
  const monday = mondayOfIso(candidate.shiftDate);
  const weekFrom = londonWallToUtc(monday);
  const weekTo = londonWallToUtc(addDaysIso(monday, 7));
  if (longestGapMs(all, weekFrom, weekTo) < 24 * HOUR) {
    const fortnightFrom = londonWallToUtc(addDaysIso(monday, -7));
    if (longestGapMs(all, fortnightFrom, weekTo) < 48 * HOUR) {
      out.push({ kind: "day_off", text: "No full day off this week (24 hours), or two days in the fortnight (48 hours)." });
    }
  }

  return out;
}
