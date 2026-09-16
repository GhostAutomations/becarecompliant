import test from "node:test";
import assert from "node:assert/strict";
import { previousCycleAt, supervisionsConsumed } from "./supervision-cycle.ts";

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

/*
 * THE SECOND REGRESSION on the same function. The slots after the active one keep the
 * previous cycle's date until they are redone, but they indexed it by slot number, which
 * only lines up when that cycle held exactly three. Chloe Driscoll's held two, so slot 3
 * asked for the third of two and her record showed nothing where the board showed 3 Apr.
 */
test("a short previous cycle fills the last slots, not the first", () => {
  const prev = ["2026-01-02", "2026-04-03"];
  assert.equal(previousCycleAt(prev, 1, 3), null);
  assert.equal(previousCycleAt(prev, 2, 3), "2026-01-02");
  assert.equal(previousCycleAt(prev, 3, 3), "2026-04-03");
});

test("a full previous cycle maps slot for slot", () => {
  const prev = ["2025-10-16", "2026-01-14", "2026-04-14"];
  assert.equal(previousCycleAt(prev, 1, 3), "2025-10-16");
  assert.equal(previousCycleAt(prev, 2, 3), "2026-01-14");
  assert.equal(previousCycleAt(prev, 3, 3), "2026-04-14");
});

test("a single previous completion is the last slot", () => {
  // Vera Asanimor: one supervision before her appraisal, so it is Supervision 3.
  assert.equal(previousCycleAt(["2026-03-02"], 3, 3), "2026-03-02");
  assert.equal(previousCycleAt(["2026-03-02"], 2, 3), null);
});

test("no previous cycle gives nothing anywhere", () => {
  for (const n of [1, 2, 3]) assert.equal(previousCycleAt([], n, 3), null);
});

test("a cycle of four works the same way", () => {
  const prev = ["2026-02-01", "2026-05-01"];
  assert.equal(previousCycleAt(prev, 3, 4), "2026-02-01");
  assert.equal(previousCycleAt(prev, 4, 4), "2026-05-01");
  assert.equal(previousCycleAt(prev, 2, 4), null);
});

