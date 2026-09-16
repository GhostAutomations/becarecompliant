import test from "node:test";
import assert from "node:assert/strict";
import { supervisionsConsumed } from "./supervision-cycle.ts";

test("no appraisal means nothing is closed off", () => {
  assert.equal(supervisionsConsumed(["2026-03-02", "2026-06-19"], null), 0);
  assert.equal(supervisionsConsumed([], null), 0);
});

/*
 * THE REGRESSION. Vera Asanimor: three supervisions, one appraisal, and only ONE of the
 * three came before it. Counting three per appraisal emptied her current cycle, so her
 * record showed Supervision 1 as not yet done while slots 2 and 3 held the supervisions
 * she had completed since, and the due dates hung off the wrong anchor.
 */
test("an irregular history splits on the date, not on a count", () => {
  const all = ["2026-03-02", "2026-06-19", "2026-09-03"];
  assert.equal(supervisionsConsumed(all, "2026-04-15"), 1);
});

test("a regular history still splits where it always did", () => {
  const all = ["2026-01-10", "2026-03-01", "2026-05-01", "2026-08-01"];
  // Three before the appraisal, one after: the same answer counting would have given.
  assert.equal(supervisionsConsumed(all, "2026-06-01"), 3);
});

test("a supervision on the day of the appraisal closes with it", () => {
  // The appraisal ends the cycle, so same day belongs to the cycle it ends.
  assert.equal(supervisionsConsumed(["2026-04-15", "2026-06-19"], "2026-04-15"), 1);
});

test("an appraisal before every supervision consumes none", () => {
  assert.equal(supervisionsConsumed(["2026-06-19", "2026-09-03"], "2026-04-15"), 0);
});

test("an appraisal after every supervision consumes them all", () => {
  const all = ["2026-03-02", "2026-06-19", "2026-09-03"];
  assert.equal(supervisionsConsumed(all, "2026-10-01"), 3);
});

test("more than a cycle's worth before the appraisal is still counted honestly", () => {
  // Four supervisions in one cycle happens; it must not silently leave one behind.
  const all = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-07-05"];
  assert.equal(supervisionsConsumed(all, "2026-05-01"), 4);
});
