import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. probation.ts has no runtime imports for exactly this reason. */
import {
  DEFAULT_PROBATION,
  PROBATION_UNITS,
  isProbationUnit,
  parseProbationPeriod,
  probationFrom,
  probationLabel,
  probationToRecurrence,
} from "./probation.ts";

test("THE POINT: a company writes the period in the words of its contract", () => {
  assert.equal(probationLabel({ value: 12, unit: "week" }), "12 weeks");
  assert.equal(probationLabel({ value: 3, unit: "month" }), "3 months");
  assert.equal(probationLabel({ value: 90, unit: "day" }), "90 days");
});

test("one of anything is singular", () => {
  assert.equal(probationLabel({ value: 1, unit: "month" }), "1 month");
  assert.equal(probationLabel({ value: 1, unit: "week" }), "1 week");
  assert.equal(probationLabel({ value: 1, unit: "day" }), "1 day");
});

test("the default is three months, not a number nobody recognises", () => {
  assert.deepEqual(DEFAULT_PROBATION, { value: 3, unit: "month" });
  assert.equal(probationLabel(DEFAULT_PROBATION), "3 months");
});

test("the dropdown offers days, weeks and months in that order", () => {
  assert.deepEqual(
    PROBATION_UNITS.map((u) => u.unit),
    ["day", "week", "month"],
  );
});

test("a unit is only a unit if it is one of the three", () => {
  assert.equal(isProbationUnit("month"), true);
  assert.equal(isProbationUnit("year"), false);
  assert.equal(isProbationUnit(""), false);
  assert.equal(isProbationUnit(null), false);
});

test("a blank, zero, negative or non-numeric period is refused", () => {
  for (const bad of ["", "   ", "0", "-1", "abc", null, undefined]) {
    const res = parseProbationPeriod(bad, "month");
    assert.ok("error" in res, `expected ${String(bad)} to be refused`);
  }
});

test("a missing or unknown unit is refused before the number is even read", () => {
  assert.deepEqual(parseProbationPeriod("3", "year"), {
    error: "Choose days, weeks or months.",
  });
  assert.ok("error" in parseProbationPeriod("3", ""));
});

test("THE TYPO GUARD: 90 in the Months box is refused, 90 in the Days box is fine", () => {
  const months = parseProbationPeriod("90", "month");
  assert.ok("error" in months);
  assert.match((months as { error: string }).error, /24 months/);

  assert.deepEqual(parseProbationPeriod("90", "day"), {
    period: { value: 90, unit: "day" },
  });
});

test("each unit has its own ceiling", () => {
  assert.ok("period" in parseProbationPeriod("104", "week"));
  assert.ok("error" in parseProbationPeriod("105", "week"));
  assert.ok("period" in parseProbationPeriod("730", "day"));
  assert.ok("error" in parseProbationPeriod("731", "day"));
});

test("a whitespace-padded number is accepted", () => {
  assert.deepEqual(parseProbationPeriod("  6 ", "month"), {
    period: { value: 6, unit: "month" },
  });
});

test("a stored row reads back as itself", () => {
  assert.deepEqual(probationFrom(12, "week"), { value: 12, unit: "week" });
  assert.deepEqual(probationFrom("12", "week"), { value: 12, unit: "week" });
});

test("a row that cannot be read falls back to the default, it never throws", () => {
  assert.deepEqual(probationFrom(null, null), DEFAULT_PROBATION);
  assert.deepEqual(probationFrom(90, "fortnight"), DEFAULT_PROBATION);
  assert.deepEqual(probationFrom(0, "month"), DEFAULT_PROBATION);
  assert.deepEqual(probationFrom(99, "month"), DEFAULT_PROBATION);
});

test("the period hands the recurrence engine its own unit, never days", () => {
  assert.deepEqual(probationToRecurrence({ value: 3, unit: "month" }), {
    frequency: "month",
    interval: 3,
  });
  assert.deepEqual(probationToRecurrence({ value: 12, unit: "week" }), {
    frequency: "week",
    interval: 12,
  });
});
