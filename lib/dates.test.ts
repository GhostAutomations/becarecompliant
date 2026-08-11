import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test stays importless and is reached this way. */
import { addYearsIso, ukDate } from "./dates.ts";

test("an ISO date reads as a British date on a document", () => {
  assert.equal(ukDate("2026-07-16"), "16 July 2026");
  assert.equal(ukDate("2026-12-01"), "1 December 2026");
  assert.equal(ukDate("2027-03-04"), "4 March 2027");
});

test("the 4th of March never becomes the 3rd of April", () => {
  // The whole point on a document a regulator may read.
  assert.equal(ukDate("2027-03-04").includes("March"), true);
});

test("a timestamp is read for its DATE, with no timezone slide", () => {
  assert.equal(ukDate("2026-07-16T23:30:00+00:00"), "16 July 2026");
  assert.equal(ukDate("2026-01-01T00:00:00Z"), "1 January 2026");
});

test("nothing recorded stays empty, it does not become a date", () => {
  assert.equal(ukDate(null), "");
  assert.equal(ukDate(undefined), "");
  assert.equal(ukDate(""), "");
});

test("anything that is not a date is handed back UNCHANGED, never Invalid Date", () => {
  assert.equal(ukDate("next March"), "next March");
  assert.equal(ukDate("Completed"), "Completed");
  assert.equal(ukDate("16/07/2026"), "16/07/2026");
});

test("an impossible ISO date is handed back, NEVER silently rolled forward", () => {
  // Date.UTC rolls: the 30th of February becomes 2 March and month 13 becomes next January.
  // A real but WRONG date on a regulator's document is worse than visible nonsense.
  assert.equal(ukDate("2026-02-30"), "2026-02-30");
  assert.equal(ukDate("2026-13-01"), "2026-13-01");
  assert.equal(ukDate("2026-00-10"), "2026-00-10");
  assert.equal(ukDate("2026-04-31"), "2026-04-31");
});

test("a real leap day still reads as a date", () => {
  assert.equal(ukDate("2028-02-29"), "29 February 2028");
});

test("month and year boundaries survive the round trip guard", () => {
  // The guard rejects anything Date.UTC rolled, so the legitimate edges have to be pinned.
  assert.equal(ukDate("2026-01-01"), "1 January 2026");
  assert.equal(ukDate("2026-01-31"), "31 January 2026");
  assert.equal(ukDate("2026-02-28"), "28 February 2026");
  assert.equal(ukDate("2026-03-01"), "1 March 2026");
  assert.equal(ukDate("2026-04-30"), "30 April 2026");
  assert.equal(ukDate("2026-12-31"), "31 December 2026");
});

// --- addYearsIso: the eight year retention clock (THE LIST item 18) -----------
//
// This function decides the day somebody's evidence is destroyed, so it is tested on the
// awkward dates rather than the easy ones.

test("eight years on from a leaving date", () => {
  assert.equal(addYearsIso("2026-08-11", 8), "2034-08-11");
  assert.equal(addYearsIso("2020-01-01", 8), "2028-01-01");
});

// 29 February has no anniversary in a non leap year. Clamping keeps it in February; rolling
// forward would land the record in March, a month later than the anniversary anybody reading
// the record would expect.
test("29 February clamps to 28 February when the target year is not a leap year", () => {
  assert.equal(addYearsIso("2024-02-29", 8), "2032-02-29"); // 2032 IS a leap year
  assert.equal(addYearsIso("2024-02-29", 1), "2025-02-28");
  assert.equal(addYearsIso("2024-02-29", 3), "2027-02-28");
});

test("month ends survive", () => {
  assert.equal(addYearsIso("2026-01-31", 8), "2034-01-31");
  assert.equal(addYearsIso("2026-12-31", 8), "2034-12-31");
});

// Better no retention date at all (nothing ever expires) than a wrong one (records destroyed
// on a date nobody chose).
test("anything that is not an ISO date returns null rather than a guess", () => {
  assert.equal(addYearsIso("11/08/2026", 8), null);
  assert.equal(addYearsIso("", 8), null);
  assert.equal(addYearsIso("2026-13-01", 8), null);
  assert.equal(addYearsIso("not a date", 8), null);
});

test("zero years is the same date, so a mis-set minimum cannot silently shift it", () => {
  assert.equal(addYearsIso("2026-08-11", 0), "2026-08-11");
});
