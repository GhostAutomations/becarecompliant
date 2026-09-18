import { test } from "node:test";
import assert from "node:assert/strict";
import { reportableCheck } from "./reportable.ts";

test("a Setup Visit that has been done is never reported again", () => {
  // Robert Owen: setup visit due and done 03/02/2021, reported 2053 days overdue.
  assert.equal(
    reportableCheck({ recurring: false, dueDate: "2021-02-03", lastCompletedOn: "2021-02-03" }),
    false,
  );
});

test("a one-off that has NOT been done is still outstanding", () => {
  assert.equal(
    reportableCheck({ recurring: false, dueDate: "2021-02-03", lastCompletedOn: null }),
    true,
  );
});

test("a recurring check whose completion met its due date is not overdue", () => {
  // Janet Oladunni: appraisal due 03/07/2026, done 03/07/2026, reported 77 days overdue.
  assert.equal(
    reportableCheck({ recurring: true, dueDate: "2026-07-03", lastCompletedOn: "2026-07-03" }),
    false,
  );
});

test("a recurring check due again after its last completion is reported", () => {
  // The ordinary shape: done in May, next one due in June and missed.
  assert.equal(
    reportableCheck({ recurring: true, dueDate: "2026-06-16", lastCompletedOn: "2026-05-19" }),
    true,
  );
});

test("a recurring check never done is reported", () => {
  assert.equal(
    reportableCheck({ recurring: true, dueDate: "2026-06-16", lastCompletedOn: null }),
    true,
  );
});

test("no due date is nothing to report", () => {
  assert.equal(reportableCheck({ recurring: true, dueDate: null, lastCompletedOn: null }), false);
  assert.equal(
    reportableCheck({ recurring: false, dueDate: null, lastCompletedOn: "2026-01-01" }),
    false,
  );
});
