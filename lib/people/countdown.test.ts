import { test } from "node:test";
import assert from "node:assert/strict";
import { dueCountdown } from "./countdown.ts";

test("the days left, counted whole", () => {
  // Asim: Supervision 3 due 15/10/2026, read on 18/09/2026.
  assert.equal(dueCountdown("2026-10-15", "2026-09-18"), "27 days");
  assert.equal(dueCountdown("2026-09-19", "2026-09-18"), "1 day");
});

test("the day it falls due says so", () => {
  assert.equal(dueCountdown("2026-09-18", "2026-09-18"), "Due today");
});

test("late is counted the same way and SAID", () => {
  assert.equal(dueCountdown("2026-09-17", "2026-09-18"), "1 day late");
  assert.equal(dueCountdown("2026-09-11", "2026-09-18"), "7 days late");
});

test("it counts across a month and a year end", () => {
  assert.equal(dueCountdown("2026-10-01", "2026-09-30"), "1 day");
  assert.equal(dueCountdown("2027-01-01", "2026-12-31"), "1 day");
  assert.equal(dueCountdown("2026-03-01", "2026-02-28"), "1 day");
});

test("a leap day is a day like any other", () => {
  assert.equal(dueCountdown("2028-03-01", "2028-02-28"), "2 days");
});

test("nothing scheduled counts to nothing", () => {
  assert.equal(dueCountdown(null, "2026-09-18"), null);
  assert.equal(dueCountdown(undefined, "2026-09-18"), null);
  assert.equal(dueCountdown("not a date", "2026-09-18"), null);
});
