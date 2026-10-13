import test from "node:test";
import assert from "node:assert/strict";

import { effectiveDue, isPausedCheck, pausedLabel, resumeDueFor, returnDateProblem } from "./hospital-pause.ts";

test("in hospital, a check still to do is paused", () => {
  assert.equal(isPausedCheck({ serviceStatus: "hospital", recurring: true, lastCompletedOn: "2026-07-05", dueDate: "2026-10-05" }), true);
  assert.equal(isPausedCheck({ serviceStatus: "hospital", recurring: true, lastCompletedOn: null, dueDate: "2026-12-06" }), true);
});

test("not paused: active, respite, a one off already done, or no due date yet", () => {
  assert.equal(isPausedCheck({ serviceStatus: "active", recurring: true, lastCompletedOn: null, dueDate: "2026-10-05" }), false);
  assert.equal(isPausedCheck({ serviceStatus: "respite", recurring: true, lastCompletedOn: null, dueDate: "2026-10-05" }), false);
  assert.equal(isPausedCheck({ serviceStatus: "hospital", recurring: false, lastCompletedOn: "2024-06-21", dueDate: "2024-06-19" }), false);
  assert.equal(isPausedCheck({ serviceStatus: "hospital", recurring: true, lastCompletedOn: null, dueDate: null }), false);
});

test("rule 2: overdue checks are due 7 days after the return; later ones keep their dates", () => {
  const back = { returnedOn: "2026-10-20", recurring: true, lastCompletedOn: "2026-07-05" };
  assert.equal(resumeDueFor({ ...back, dueDate: "2026-10-05" }), "2026-10-27");
  assert.equal(resumeDueFor({ ...back, dueDate: "2026-10-26" }), "2026-10-27");
  assert.equal(resumeDueFor({ ...back, dueDate: "2026-10-27" }), null);
  assert.equal(resumeDueFor({ ...back, dueDate: "2026-12-06" }), null);
  assert.equal(resumeDueFor({ ...back, dueDate: null }), null);
  assert.equal(resumeDueFor({ ...back, recurring: false, lastCompletedOn: "2024-06-21", dueDate: "2024-06-19" }), null);
});

test("idempotent: the same return twice gives the same date, never pushed twice", () => {
  const first = resumeDueFor({ dueDate: "2026-10-05", recurring: true, lastCompletedOn: null, returnedOn: "2026-10-20" });
  const again = resumeDueFor({ dueDate: "2026-10-05", resumeDueDate: first, recurring: true, lastCompletedOn: null, returnedOn: "2026-10-20" });
  assert.equal(first, "2026-10-27");
  assert.equal(again, "2026-10-27");
});

test("hospital, back, hospital, back: the second return counts from the second date", () => {
  const first = resumeDueFor({ dueDate: "2026-10-05", recurring: true, lastCompletedOn: null, returnedOn: "2026-10-20" });
  const second = resumeDueFor({ dueDate: "2026-10-05", resumeDueDate: first, recurring: true, lastCompletedOn: null, returnedOn: "2026-11-10" });
  assert.equal(second, "2026-11-17");
  // A second return before the first resumed date has passed changes nothing.
  assert.equal(resumeDueFor({ dueDate: "2026-10-05", resumeDueDate: "2026-11-17", recurring: true, lastCompletedOn: null, returnedOn: "2026-11-01" }), "2026-11-17");
});

test("month ends, the leap day and the clock change", () => {
  const due = { dueDate: "2026-01-01", recurring: true, lastCompletedOn: null };
  assert.equal(resumeDueFor({ ...due, returnedOn: "2026-08-31" }), "2026-09-07");
  assert.equal(resumeDueFor({ ...due, returnedOn: "2026-02-28" }), "2026-03-07");
  assert.equal(resumeDueFor({ ...due, returnedOn: "2028-02-29" }), "2028-03-07");
  assert.equal(resumeDueFor({ ...due, returnedOn: "2026-10-25" }), "2026-11-01");
  assert.equal(resumeDueFor({ ...due, returnedOn: "2026-12-29" }), "2027-01-05");
});

test("the due date that counts: the resumed one only when it is later", () => {
  assert.equal(effectiveDue("2026-10-05", "2026-10-27"), "2026-10-27");
  assert.equal(effectiveDue("2027-01-20", "2026-10-27"), "2027-01-20");
  assert.equal(effectiveDue("2026-10-05", null), "2026-10-05");
  assert.equal(effectiveDue(null, "2026-10-27"), null);
});

test("the paused words: with the date when known, never Compliant", () => {
  assert.equal(pausedLabel("2026-10-05"), "Paused: in hospital since 5 October 2026");
  assert.equal(pausedLabel(null), "Paused: in hospital");
  assert.equal(pausedLabel("2026-10-05", false), "Paused: in hospital");
});

test("the return date: required, not in the future, not before they went in", () => {
  assert.equal(returnDateProblem("", "2026-10-13"), "Enter the date they came out of hospital.");
  assert.equal(returnDateProblem("2026-10-14", "2026-10-13"), "The date they came out of hospital cannot be in the future.");
  assert.equal(
    returnDateProblem("2026-10-01", "2026-10-13", "2026-10-05"),
    "The date they came out of hospital is before the date they went in (5 October 2026).",
  );
  assert.equal(returnDateProblem("2026-10-13", "2026-10-13", "2026-10-05"), null);
  assert.equal(returnDateProblem("2026-10-10", "2026-10-13", null), null);
});
