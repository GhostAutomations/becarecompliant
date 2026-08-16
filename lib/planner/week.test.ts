import { test } from "node:test";
import assert from "node:assert/strict";
import { mondayOf, shiftWeek, weekLabel, weekDays } from "./week.ts";
import { ukShortDate } from "../dates.ts";

test("the week starts on Monday, and Sunday belongs to the week it ends", () => {
  // 2026-08-15 is a Saturday; 16th is the Sunday that ends the same week.
  assert.equal(mondayOf("2026-08-15"), "2026-08-10");
  assert.equal(mondayOf("2026-08-16"), "2026-08-10");
  // The off by one: Monday the 17th starts a NEW week.
  assert.equal(mondayOf("2026-08-17"), "2026-08-17");
  assert.equal(mondayOf("2026-08-10"), "2026-08-10");
});

test("a week either side of a month end", () => {
  assert.equal(mondayOf("2026-09-01"), "2026-08-31");
  assert.deepEqual(weekDays("2026-09-01").slice(0, 3), ["2026-08-31", "2026-09-01", "2026-09-02"]);
});

test("a week either side of a year end", () => {
  // 1 January 2027 is a Friday.
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(shiftWeek("2026-12-28", 1), "2027-01-04");
  assert.equal(shiftWeek("2027-01-04", -1), "2026-12-28");
});

test("a week either side of a leap day", () => {
  // 2028 is a leap year; 29 February 2028 is a Tuesday.
  assert.equal(mondayOf("2028-02-29"), "2028-02-28");
  assert.deepEqual(weekDays("2028-02-29").slice(0, 4), [
    "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02",
  ]);
});

test("the clocks changing cannot move a day", () => {
  // British Summer Time ends on the last Sunday in October. The sums are UTC civil dates, so
  // the week straddling it is still seven days and still starts on the Monday.
  assert.equal(mondayOf("2026-10-25"), "2026-10-19");
  assert.equal(weekDays("2026-10-25").length, 7);
  assert.equal(shiftWeek("2026-10-19", 1), "2026-10-26");
  // And going the other way, in March.
  assert.equal(shiftWeek("2026-03-23", 1), "2026-03-30");
});

test("prev and next always land back where they started", () => {
  for (const iso of ["2026-01-05", "2026-08-10", "2026-12-28", "2028-02-28"]) {
    assert.equal(shiftWeek(shiftWeek(iso, 1), -1), iso);
    assert.equal(shiftWeek(shiftWeek(iso, -4), 4), iso);
  }
});

test("the heading reads properly, and never shows a raw ISO date", () => {
  assert.equal(weekLabel("2026-08-03"), "3 to 9 Aug 2026");
  assert.equal(weekLabel("2026-08-31"), "31 Aug to 6 Sep 2026");
  assert.equal(weekLabel("2026-12-28"), "28 Dec to 3 Jan 2027");
  for (const iso of ["2026-08-03", "2026-08-31", "2026-12-28"]) {
    assert.doesNotMatch(weekLabel(iso), /\d{4}-\d{2}-\d{2}/);
    assert.doesNotMatch(weekLabel(iso), /[-]/, "no dashes in customer facing copy");
  }
});

test("rubbish in does not throw or invent a date", () => {
  assert.equal(mondayOf("not a date"), "not a date");
  assert.equal(shiftWeek("", 1), "");
  assert.equal(weekLabel("2026-8-3"), "");
  // weekDays was the one that threw RangeError instead, which takes the Planner down with it.
  assert.deepEqual(weekDays("not a date"), []);
  assert.deepEqual(weekDays(""), []);
  assert.equal(weekDays("2026-08-15").length, 7);
});

test("THE MONTH IS SPELLED ONE WAY ACROSS THE APP", () => {
  /*
   * lib/dates.ts and this file each carry their own month table, because this one has to stay
   * importless for the test harness. Same arrangement as renewal.ts and recurrence.ts, and the
   * same protection: the copies are asserted to agree, so they cannot drift apart in silence.
   *
   * The defect that earned this test: toLocaleDateString("en-GB", { month: "short" }) renders
   * September as "Sept" in current ICU, so the Planner week heading said "6 Sep" and its own List
   * view said "6 Sept", on the same booking, and the toggle between them changed the spelling.
   */
  for (let m = 1; m <= 12; m++) {
    const iso = `2026-${String(m).padStart(2, "0")}-06`;
    // "6 Xxx 2026" from dates.ts, and the heading of the week that ENDS in that month from here.
    const fromDates = ukShortDate(iso).split(" ")[1];
    const fromWeek = weekLabel(mondayOf(iso)).split(" to ")[1].split(" ")[1];
    assert.equal(fromWeek, fromDates, `month ${m}`);
  }
  assert.equal(ukShortDate("2026-09-06"), "6 Sep 2026");
  assert.doesNotMatch(weekLabel("2026-08-31"), /Sept\b/);
});
