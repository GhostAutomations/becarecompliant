import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test stays importless and is reached this way. */
import { daysInPeriod, onePerDayDates } from "./recurring-dates.ts";

test("seven lines in a seven day week: one each, in order", () => {
  assert.deepEqual(onePerDayDates(7, "2026-10-12", "2026-10-18"), [
    "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
  ]);
});

test("anything that does not fit exactly stays undated", () => {
  assert.deepEqual(onePerDayDates(1, "2026-10-12", "2026-10-18"), [null]);
  assert.deepEqual(onePerDayDates(8, "2026-10-12", "2026-10-18"), [null, null, null, null, null, null, null, null]);
  assert.deepEqual(onePerDayDates(0, "2026-10-12", "2026-10-18"), []);
  assert.deepEqual(onePerDayDates(2, "2026-10-18", "2026-10-12"), [null, null]);
});

test("month ends, the leap day and the clock change", () => {
  assert.equal(daysInPeriod("2026-09-01", "2026-09-30"), 30);
  assert.equal(daysInPeriod("2028-02-01", "2028-02-29"), 29);
  assert.deepEqual(onePerDayDates(7, "2026-10-22", "2026-10-28"), [
    "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28",
  ]);
  assert.deepEqual(onePerDayDates(3, "2026-12-30", "2027-01-01"), ["2026-12-30", "2026-12-31", "2027-01-01"]);
});
