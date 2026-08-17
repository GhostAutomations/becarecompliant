import test from "node:test";
import assert from "node:assert/strict";
import {
  implausibleYearMessage,
  DATE_YEAR_MIN,
  DATE_YEAR_MAX,
} from "./date-plausible.ts";

/**
 * The year-range rule on typed dates. Chrome's date control turns a typed
 * two-digit year into the literal year 0026, and one reached a live holiday
 * card as "Back at work 19 Feb 0026" (17 Aug QA). validateAnswers applies this
 * rule to every date answer; the holiday card applies it before printing.
 */

test("a normal date passes", () => {
  assert.equal(implausibleYearMessage("2026-09-18"), null);
});

test("the year 0026 is refused, and the message names the year rule", () => {
  const msg = implausibleYearMessage("0026-02-19");
  assert.ok(msg && /year/i.test(msg), "expected a year message, got " + msg);
});

test("the boundaries hold: 1900 and 2100 pass, 1899 and 2101 fail", () => {
  assert.equal(implausibleYearMessage(String(DATE_YEAR_MIN) + "-01-01"), null);
  assert.equal(implausibleYearMessage(String(DATE_YEAR_MAX) + "-12-31"), null);
  assert.ok(implausibleYearMessage("1899-12-31"));
  assert.ok(implausibleYearMessage("2101-01-01"));
});
