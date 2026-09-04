import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. window.ts has no runtime imports for exactly this reason. */
import {
  DEFAULT_ABSENCE_WINDOW,
  WINDOW_UNITS,
  absenceWindowFrom,
  isWindowUnit,
  parseAbsenceWindow,
  windowFromDays,
  windowLabel,
} from "./window.ts";

test("THE POINT: a policy says a rolling twelve months, not 365 days", () => {
  assert.deepEqual(DEFAULT_ABSENCE_WINDOW, { value: 12, unit: "month" });
  assert.equal(windowLabel(DEFAULT_ABSENCE_WINDOW), "12 months");
});

test("the window is written in the words of the policy", () => {
  assert.equal(windowLabel({ value: 52, unit: "week" }), "52 weeks");
  assert.equal(windowLabel({ value: 365, unit: "day" }), "365 days");
  assert.equal(windowLabel({ value: 1, unit: "month" }), "1 month");
});

test("the dropdown offers days, weeks and months in that order", () => {
  assert.deepEqual(WINDOW_UNITS.map((u) => u.unit), ["day", "week", "month"]);
});

test("a unit is only a unit if it is one of the three", () => {
  assert.equal(isWindowUnit("week"), true);
  assert.equal(isWindowUnit("year"), false);
  assert.equal(isWindowUnit(null), false);
});

test("a blank, zero or non-numeric window is refused", () => {
  for (const bad of ["", "  ", "0", "-3", "twelve", null, undefined]) {
    assert.ok("error" in parseAbsenceWindow(bad, "month"), `expected ${String(bad)} refused`);
  }
});

test("an unknown unit is refused before the number is read", () => {
  assert.deepEqual(parseAbsenceWindow("12", "year"), { error: "Choose days, weeks or months." });
});

test("THE TYPO GUARD: 365 in the Months box is refused, 365 in the Days box is fine", () => {
  const months = parseAbsenceWindow("365", "month");
  assert.ok("error" in months);
  assert.match((months as { error: string }).error, /60 months/);
  assert.deepEqual(parseAbsenceWindow("365", "day"), {
    window: { value: 365, unit: "day" },
  });
});

test("five years is the ceiling in every unit", () => {
  assert.ok("window" in parseAbsenceWindow("60", "month"));
  assert.ok("error" in parseAbsenceWindow("61", "month"));
  assert.ok("window" in parseAbsenceWindow("260", "week"));
  assert.ok("error" in parseAbsenceWindow("261", "week"));
  assert.ok("window" in parseAbsenceWindow("1825", "day"));
  assert.ok("error" in parseAbsenceWindow("1826", "day"));
});

test("a stored row reads back as itself, and an unreadable one falls back", () => {
  assert.deepEqual(absenceWindowFrom(52, "week"), { value: 52, unit: "week" });
  assert.deepEqual(absenceWindowFrom("52", "week"), { value: 52, unit: "week" });
  assert.deepEqual(absenceWindowFrom(null, null), DEFAULT_ABSENCE_WINDOW);
  assert.deepEqual(absenceWindowFrom(12, "fortnight"), DEFAULT_ABSENCE_WINDOW);
  assert.deepEqual(absenceWindowFrom(999, "month"), DEFAULT_ABSENCE_WINDOW);
});

test("THE BACKFILL: 365 days was always meant to be twelve months", () => {
  assert.deepEqual(windowFromDays(365), { value: 12, unit: "month" });
  assert.deepEqual(windowFromDays(730), { value: 24, unit: "month" });
});

test("a window in whole weeks converts to weeks, anything else stays in days", () => {
  assert.deepEqual(windowFromDays(84), { value: 12, unit: "week" });
  assert.deepEqual(windowFromDays(100), { value: 100, unit: "day" });
});

test("a nonsense day count falls back rather than storing nonsense", () => {
  assert.deepEqual(windowFromDays(0), DEFAULT_ABSENCE_WINDOW);
  assert.deepEqual(windowFromDays(null), DEFAULT_ABSENCE_WINDOW);
  assert.deepEqual(windowFromDays(99999), DEFAULT_ABSENCE_WINDOW);
});
