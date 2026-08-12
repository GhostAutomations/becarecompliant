import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import {
  summariseDisclosures,
  daysBetween,
  median,
  withinRange,
  type CountableDisclosure,
} from "./summary.ts";

function d(over: Partial<CountableDisclosure> = {}): CountableDisclosure {
  return {
    received_on: "2026-03-01",
    category: "Unsafe care or poor practice",
    anonymous: true,
    status: "open",
    closed_on: null,
    ...over,
  };
}

test("withinRange is inclusive and open ended on a null bound", () => {
  assert.equal(withinRange("2026-01-01", "2026-01-01", "2026-06-30"), true);
  assert.equal(withinRange("2026-06-30", "2026-01-01", "2026-06-30"), true);
  assert.equal(withinRange("2026-07-01", "2026-01-01", "2026-06-30"), false);
  assert.equal(withinRange("2020-01-01", null, null), true);
  assert.equal(withinRange("nonsense", null, null), false);
});

test("daysBetween refuses a backwards pair rather than returning a negative", () => {
  assert.equal(daysBetween("2026-03-01", "2026-03-15"), 14);
  assert.equal(daysBetween("2026-03-01", "2026-03-01"), 0);
  assert.equal(daysBetween("2026-03-15", "2026-03-01"), null);
  assert.equal(daysBetween("2026-03-01", null), null);
  assert.equal(daysBetween(null, "2026-03-01"), null);
  assert.equal(daysBetween("not a date", "2026-03-01"), null);
});

test("daysBetween is not shifted by British Summer Time", () => {
  // 29 March 2026 is the BST changeover. Parsed as civil dates in UTC this is exactly 2 days.
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
});

test("median takes the middle of an odd set and the mean of the middle two of an even one", () => {
  assert.equal(median([]), null);
  assert.equal(median([7]), 7);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 3);
});

test("an empty set summarises to zeros with no median", () => {
  const s = summariseDisclosures([]);
  assert.equal(s.total, 0);
  assert.equal(s.medianDaysToClose, null);
  assert.deepEqual(s.byCategory, []);
});

test("anonymous and named account for every disclosure", () => {
  const s = summariseDisclosures([
    d({ anonymous: true }),
    d({ anonymous: true }),
    d({ anonymous: false }),
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.anonymous, 2);
  assert.equal(s.named, 1);
  assert.equal(s.anonymous + s.named, s.total);
});

test("statuses are counted separately and add up to the total", () => {
  const s = summariseDisclosures([
    d({ status: "open" }),
    d({ status: "under_review" }),
    d({ status: "closed", closed_on: "2026-03-10" }),
    d({ status: "closed", closed_on: "2026-03-20" }),
  ]);
  assert.equal(s.open, 1);
  assert.equal(s.underReview, 1);
  assert.equal(s.closed, 2);
  assert.equal(s.open + s.underReview + s.closed, s.total);
});

test("the median ignores a closed disclosure with no closing date, rather than counting it as nil days", () => {
  const s = summariseDisclosures([
    d({ status: "closed", closed_on: "2026-03-11" }), // 10 days
    d({ status: "closed", closed_on: "2026-03-31" }), // 30 days
    d({ status: "closed", closed_on: null }), // no date: must not become a zero
  ]);
  assert.equal(s.closed, 3);
  assert.equal(s.medianDaysToClose, 20);
});

test("one very slow disclosure cannot drag the figure a provider quotes", () => {
  const rows = [
    d({ status: "closed", closed_on: "2026-03-06" }), // 5
    d({ status: "closed", closed_on: "2026-03-08" }), // 7
    d({ status: "closed", closed_on: "2027-03-01" }), // 365
  ];
  assert.equal(summariseDisclosures(rows).medianDaysToClose, 7);
});

test("categories are commonest first, ties alphabetical, blank counted as Other", () => {
  const s = summariseDisclosures([
    d({ category: "Medication practice" }),
    d({ category: "Health and safety" }),
    d({ category: "Health and safety" }),
    d({ category: "   " }),
  ]);
  assert.deepEqual(s.byCategory, [
    { category: "Health and safety", count: 2 },
    { category: "Medication practice", count: 1 },
    { category: "Other", count: 1 },
  ]);
});

test("the range filters on when it was received", () => {
  const rows = [
    d({ received_on: "2025-12-31" }),
    d({ received_on: "2026-01-01" }),
    d({ received_on: "2026-06-30" }),
    d({ received_on: "2026-07-01" }),
  ];
  assert.equal(summariseDisclosures(rows, { from: "2026-01-01", to: "2026-06-30" }).total, 2);
  assert.equal(summariseDisclosures(rows).total, 4);
});
