import { test } from "node:test";
import assert from "node:assert/strict";
import { londonToday, shift, matrixDate, slashDate, longDate, sceneDates } from "./scene-dates.ts";

test("today is London's day, including just after midnight in summer time", () => {
  // 23:30 UTC on 14 Oct 2026 is 00:30 on 15 Oct in London (BST).
  assert.equal(londonToday(new Date("2026-10-14T23:30:00Z")), "2026-10-15");
  // After the clocks go back, 23:30 UTC is 23:30 in London: still the same day.
  assert.equal(londonToday(new Date("2026-11-14T23:30:00Z")), "2026-11-14");
});

test("shifting days crosses month ends, year ends and the leap day", () => {
  assert.equal(shift("2026-10-31", 1), "2026-11-01");
  assert.equal(shift("2026-12-31", 1), "2027-01-01");
  assert.equal(shift("2028-02-28", 1), "2028-02-29");
  assert.equal(shift("2028-03-01", -1), "2028-02-29");
  assert.equal(shift("2026-10-14", -32), "2026-09-12");
  assert.equal(shift("2026-10-25", 1), "2026-10-26"); // the day the clocks go back
});

test("the formats match the app's", () => {
  assert.equal(matrixDate("2026-09-12"), "12 Sep 26");
  assert.equal(slashDate("2026-10-04"), "04/10/2026");
  assert.equal(longDate("2026-10-04"), "4 October 2026");
  const s = sceneDates(new Date("2026-10-14T09:00:00Z"));
  assert.equal(s.today, "2026-10-14");
  assert.equal(s.matrix(-32), "12 Sep 26");
  assert.equal(s.slash(0), "14/10/2026");
  assert.equal(s.long(0), "14 October 2026");
});
