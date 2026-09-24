import test from "node:test";
import assert from "node:assert/strict";
import { amberWindow, isDueSoon } from "./due-soon.ts";

test("the check's own window wins, then the company's, then 14 days", () => {
  assert.equal(amberWindow(7, 14), 7);
  assert.equal(amberWindow(0, 14), 0);
  assert.equal(amberWindow(null, 21), 21);
  assert.equal(amberWindow(undefined, null), 14);
});

test("DEF-068, Thistle on 24/09/2026 with a 14 day window", () => {
  const today = "2026-09-24";
  assert.equal(isDueSoon("2026-09-25", today, 14), true); // Deborah Olabode, spot check
  assert.equal(isDueSoon("2026-10-08", today, 14), true); // the edge counts
  assert.equal(isDueSoon("2026-10-13", today, 14), false); // Chloe Driscoll: on track, not due soon
  assert.equal(isDueSoon("2026-09-17", today, 14), false); // overdue is not due soon
  assert.equal(isDueSoon("2026-09-24", today, 14), true); // due today
});

test("month and year ends", () => {
  assert.equal(isDueSoon("2027-01-05", "2026-12-25", 14), true);
  assert.equal(isDueSoon("2024-03-10", "2024-02-25", 14), true); // leap year
  assert.equal(isDueSoon("2024-03-11", "2024-02-25", 14), false);
});
