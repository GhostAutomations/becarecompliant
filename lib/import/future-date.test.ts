import { test } from "node:test";
import assert from "node:assert/strict";
import { futureDateProblem } from "./future-date.ts";

test("a completion tomorrow is refused, with the date in words", () => {
  assert.equal(
    futureDateProblem("Supervision", "2026-10-12", "2026-10-11"),
    "The Supervision date, 12 October 2026, is in the future. A check can only be recorded as done on today or an earlier date.",
  );
});

test("today and earlier dates are fine", () => {
  assert.equal(futureDateProblem("Supervision", "2026-10-11", "2026-10-11"), null);
  assert.equal(futureDateProblem("Supervision", "2025-02-28", "2026-10-11"), null);
});

test("the year end and a leap day compare as dates, not as text tricks", () => {
  assert.equal(futureDateProblem("Spot check", "2027-01-01", "2026-12-31") !== null, true);
  assert.equal(futureDateProblem("Spot check", "2028-02-29", "2028-02-29"), null);
  assert.equal(futureDateProblem("Spot check", "2028-03-01", "2028-02-29") !== null, true);
});

test("nothing typed, or something that is not a date, is left to the other checks", () => {
  assert.equal(futureDateProblem("Supervision", null, "2026-10-11"), null);
  assert.equal(futureDateProblem("Supervision", "", "2026-10-11"), null);
  assert.equal(futureDateProblem("Supervision", "12/10/2026", "2026-10-11"), null);
});
