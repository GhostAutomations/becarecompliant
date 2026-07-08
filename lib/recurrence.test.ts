/**
 * Unit tests for the recurrence engine (Phase 3). Date maths is tested, not
 * assumed: month boundaries, leap years and Europe/London DST.
 *
 * Run: node --experimental-strip-types --test lib/recurrence.test.ts
 * (or: npm test). Excluded from the Next build typecheck via tsconfig.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addInterval,
  addMonths,
  civilDateInLondon,
  compareCivil,
  daysBetween,
  daysInMonth,
  formatCivilDate,
  isLeapYear,
  nextDueDate,
  parseCivilDate,
  ragStatus,
  type CivilDate,
} from "./recurrence.ts";

const d = (s: string): CivilDate => parseCivilDate(s);
const f = formatCivilDate;

test("isLeapYear", () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2000), true); // divisible by 400
  assert.equal(isLeapYear(1900), false); // divisible by 100, not 400
});

test("daysInMonth handles Feb in leap and non-leap years", () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 1), 31);
});

test("addMonths clamps to end of shorter month (31 Jan + 1mo = 28/29 Feb)", () => {
  assert.equal(f(addMonths(d("2026-01-31"), 1)), "2026-02-28");
  assert.equal(f(addMonths(d("2024-01-31"), 1)), "2024-02-29"); // leap year
  assert.equal(f(addMonths(d("2026-03-31"), 1)), "2026-04-30");
  assert.equal(f(addMonths(d("2026-01-31"), 12)), "2027-01-31");
});

test("addMonths across a year boundary and backwards", () => {
  assert.equal(f(addMonths(d("2026-11-15"), 3)), "2027-02-15");
  assert.equal(f(addMonths(d("2026-01-15"), -1)), "2025-12-15");
});

test("29 Feb + 1 year lands on 28 Feb (non-leap target)", () => {
  assert.equal(f(addMonths(d("2024-02-29"), 12)), "2025-02-28");
  assert.equal(f(addInterval(d("2024-02-29"), "year", 1)), "2025-02-28");
});

test("addDays crosses month and leap boundaries", () => {
  assert.equal(f(addDays(d("2026-01-31"), 1)), "2026-02-01");
  assert.equal(f(addDays(d("2024-02-28"), 1)), "2024-02-29"); // leap
  assert.equal(f(addDays(d("2026-02-28"), 1)), "2026-03-01"); // non-leap
  assert.equal(f(addDays(d("2026-12-31"), 1)), "2027-01-01");
});

test("addInterval for day/week/month/year", () => {
  assert.equal(f(addInterval(d("2026-07-08"), "day", 10)), "2026-07-18");
  assert.equal(f(addInterval(d("2026-07-08"), "week", 2)), "2026-07-22");
  assert.equal(f(addInterval(d("2026-07-08"), "month", 3)), "2026-10-08");
  assert.equal(f(addInterval(d("2026-07-08"), "year", 1)), "2027-07-08");
});

test("addInterval rejects a non-positive interval", () => {
  assert.throws(() => addInterval(d("2026-07-08"), "month", 0));
  assert.throws(() => addInterval(d("2026-07-08"), "month", -1));
});

test("daysBetween and compareCivil", () => {
  assert.equal(daysBetween(d("2026-07-08"), d("2026-07-18")), 10);
  assert.equal(daysBetween(d("2026-07-18"), d("2026-07-08")), -10);
  assert.equal(daysBetween(d("2026-02-28"), d("2026-03-01")), 1); // non-leap
  assert.equal(daysBetween(d("2024-02-28"), d("2024-03-01")), 2); // leap
  assert.equal(compareCivil(d("2026-07-08"), d("2026-07-09")), -1);
  assert.equal(compareCivil(d("2026-07-08"), d("2026-07-08")), 0);
  assert.equal(compareCivil(d("2027-01-01"), d("2026-12-31")), 1);
});

test("nextDueDate — completion anchor (supervision every 3 months)", () => {
  const rule = { frequency: "month" as const, interval: 3 };
  assert.equal(f(nextDueDate(rule, { completedOn: d("2026-07-08") })!), "2026-10-08");
});

test("nextDueDate — completion anchor drifts from actual completion, not the old due date", () => {
  // Supervision was due 2026-06-19 but completed late on 2026-07-08 -> next is
  // 3 months from completion, keeping intervals honest.
  const rule = { frequency: "month" as const, interval: 3 };
  assert.equal(f(nextDueDate(rule, { completedOn: d("2026-07-08") })!), "2026-10-08");
});

test("nextDueDate — expiry anchor (right to work: due 30 days before visa expiry)", () => {
  const rule = { frequency: "year" as const, interval: 1, anchor: "expiry" as const, leadDays: 30 };
  assert.equal(f(nextDueDate(rule, { expiryDate: d("2027-03-20") })!), "2027-02-18");
});

test("nextDueDate — expiry anchor with no lead lands on the expiry date", () => {
  const rule = { frequency: "year" as const, interval: 1, anchor: "expiry" as const };
  assert.equal(f(nextDueDate(rule, { expiryDate: d("2029-04-29") })!), "2029-04-29");
});

test("nextDueDate — returns null when the anchor input is missing", () => {
  assert.equal(nextDueDate({ frequency: "month", interval: 3 }, { completedOn: null }), null);
  assert.equal(
    nextDueDate({ frequency: "year", interval: 1, anchor: "expiry" }, { expiryDate: null }),
    null,
  );
});

test("ragStatus — green, amber, red around the amber window", () => {
  const today = d("2026-07-08");
  assert.equal(ragStatus(d("2026-09-01"), today, 30), "green"); // 55 days out
  assert.equal(ragStatus(d("2026-08-07"), today, 30), "amber"); // 30 days out (edge)
  assert.equal(ragStatus(d("2026-07-20"), today, 30), "amber"); // 12 days out
  assert.equal(ragStatus(today, today, 30), "amber"); // due today = 0 days
  assert.equal(ragStatus(d("2026-07-07"), today, 30), "red"); // 1 day overdue
  assert.equal(ragStatus(null, today, 30), "green"); // unscheduled = neutral
});

test("ragStatus — a per-check amber override widens the window (DBS at 90 days)", () => {
  const today = d("2026-07-08");
  assert.equal(ragStatus(d("2026-09-01"), today, 30), "green");
  assert.equal(ragStatus(d("2026-09-01"), today, 90), "amber"); // same date, wider window
});

test("civilDateInLondon — late-evening UTC rolls to the next London day in BST", () => {
  // 2026-07-08 23:30 UTC is 00:30 on 2026-07-09 in British Summer Time (+1).
  assert.deepEqual(civilDateInLondon(new Date("2026-07-08T23:30:00Z")), d("2026-07-09"));
  // Same clock time in winter (GMT, +0) stays on the 8th.
  assert.deepEqual(civilDateInLondon(new Date("2026-01-08T23:30:00Z")), d("2026-01-08"));
});

test("civilDateInLondon — DST transition instants resolve to the correct London date", () => {
  // Spring forward: clocks go 01:00 GMT -> 02:00 BST on 2026-03-29.
  assert.deepEqual(civilDateInLondon(new Date("2026-03-29T01:30:00Z")), d("2026-03-29"));
  // Autumn back: 02:00 BST -> 01:00 GMT on 2026-10-25.
  assert.deepEqual(civilDateInLondon(new Date("2026-10-25T00:30:00Z")), d("2026-10-25"));
});

test("a month-long interval is unaffected by a DST change in between", () => {
  // Completed 2026-03-15 (GMT), +1 month crosses the 29 Mar spring-forward.
  // Calendar maths must still land exactly on 2026-04-15.
  assert.equal(f(addInterval(d("2026-03-15"), "month", 1)), "2026-04-15");
});
