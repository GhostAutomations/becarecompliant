import test from "node:test";
import assert from "node:assert/strict";
import { reschedulesOnCompletion, type ReschedulableCheck } from "./reschedule.ts";

const base: ReschedulableCheck = {
  recurring: true,
  anchor: "completion",
  schedule_mode: "interval",
  frequency: "day",
  interval: 80,
};

test("an ordinary recurring check re-dates from its completion", () => {
  assert.equal(reschedulesOnCompletion(base), true);
  assert.equal(reschedulesOnCompletion({ ...base, frequency: "month", interval: 3 }), true);
});

/*
 * The regression this file exists for. Thistle's audit was seeded monthly, the office
 * audits quarterly, and eleven of thirteen real carers imported straight into red. Moving
 * the definition to three months was not enough on its own: due_date is stored, so every
 * carer who had been audited kept the date the monthly rule gave them.
 */
test("a completed instance is re-dated, not only an untouched one", () => {
  assert.equal(reschedulesOnCompletion({ ...base, frequency: "month", interval: 1 }), true);
});

test("an expiry anchor is dated from its document, never from a completion", () => {
  assert.equal(reschedulesOnCompletion({ ...base, anchor: "expiry" }), false);
});

test("a non recurring check is finished when it is done", () => {
  // Setup Visit: not recurring, and its interval is a negative offset from the anchor,
  // which the recurrence engine rejects outright.
  assert.equal(reschedulesOnCompletion({ ...base, recurring: false, interval: -1 }), false);
});

test("the appraisal on after supervision 3 is scheduled by its supervisions", () => {
  assert.equal(reschedulesOnCompletion({ ...base, schedule_mode: "after_sup3" }), false);
});

test("an absent or impossible cadence is not a cadence", () => {
  assert.equal(reschedulesOnCompletion({ ...base, frequency: null }), false);
  assert.equal(reschedulesOnCompletion({ ...base, interval: null }), false);
  assert.equal(reschedulesOnCompletion({ ...base, interval: 0 }), false);
  assert.equal(reschedulesOnCompletion({ ...base, interval: -3 }), false);
});

test("ad hoc checks with a real interval still re-date", () => {
  // Mentoring is ad_hoc AND non recurring; recurring is what stops it, so an ad_hoc
  // mode on its own must not be the thing we test against.
  assert.equal(reschedulesOnCompletion({ ...base, schedule_mode: "ad_hoc" }), true);
  assert.equal(
    reschedulesOnCompletion({ ...base, schedule_mode: "ad_hoc", recurring: false }),
    false,
  );
});
