import { test } from "node:test";
import assert from "node:assert/strict";
import { dueBelongsToCompletion, settleSuppliedDue } from "./supplied-due.ts";

test("a due met on the day it fell due belongs to that completion", () => {
  // Janet Oladunni: the board said Annual Appraisal Due 03/07/2026 and Done 03/07/2026.
  // We imported the due as the NEXT one and reported her 77 days overdue for an appraisal
  // she had sat in.
  assert.deepEqual(settleSuppliedDue("2026-07-03", "2026-07-03"), {
    nextDue: null,
    completionDue: "2026-07-03",
  });
});

test("a due met late still belongs to that completion", () => {
  assert.deepEqual(settleSuppliedDue("2026-07-03", "2026-08-01"), {
    nextDue: null,
    completionDue: "2026-07-03",
  });
});

test("a due the completion has NOT reached is the next one", () => {
  // Done in June, next one due in December: the board is telling us what is coming.
  assert.deepEqual(settleSuppliedDue("2026-12-01", "2026-06-05"), {
    nextDue: "2026-12-01",
    completionDue: null,
  });
});

test("scheduled but never done is outstanding, not history", () => {
  assert.deepEqual(settleSuppliedDue("2026-11-28", null), {
    nextDue: "2026-11-28",
    completionDue: null,
  });
});

test("no due supplied claims nothing", () => {
  assert.deepEqual(settleSuppliedDue(null, "2026-07-03"), { nextDue: null, completionDue: null });
  assert.deepEqual(settleSuppliedDue(undefined, undefined), { nextDue: null, completionDue: null });
});

test("a day either side of the completion decides it", () => {
  assert.equal(settleSuppliedDue("2026-07-04", "2026-07-03").nextDue, "2026-07-04");
  assert.equal(settleSuppliedDue("2026-07-02", "2026-07-03").nextDue, null);
});

test("a due met on or before the day belongs to that completion", () => {
  assert.equal(dueBelongsToCompletion("2026-08-24", "2026-08-24", 80), true);
  assert.equal(dueBelongsToCompletion("2026-06-01", "2026-07-01", 80), true); // done late
});

test("done a little early is still that same review", () => {
  // Amanda Ford, Review 1: due 14/06/2026, done 05/06/2026. Nine days early.
  assert.equal(dueBelongsToCompletion("2026-06-14", "2026-06-05", 80), true);
});

test("a due a whole cycle or more ahead has rolled forward and is NOT this one's", () => {
  // Amanda Ford, Review 4: done 26/03/2026 carrying a due of 12/11/2026 -- 231 days.
  assert.equal(dueBelongsToCompletion("2026-11-12", "2026-03-26", 80), false);
  // Asim Riaz, Supervision 1: done 08/05/2026 carrying 11/05/2027 -- 368 days.
  assert.equal(dueBelongsToCompletion("2027-05-11", "2026-05-08", 80), false);
});

test("the line is a whole cycle: one day under belongs, a full cycle does not", () => {
  // 79 days early is an early completion of this review.
  assert.equal(dueBelongsToCompletion("2026-05-31", "2026-03-13", 80), true);
  // 80 days is the next review's date, arrived at by the cadence itself.
  assert.equal(dueBelongsToCompletion("2026-06-01", "2026-03-13", 80), false);
});

test("a check with no fixed cadence takes the sheet at its word", () => {
  assert.equal(dueBelongsToCompletion("2027-01-01", "2026-01-01", null), true);
  assert.equal(dueBelongsToCompletion("2027-01-01", "2026-01-01", 0), true);
});

test("nothing supplied belongs to nothing", () => {
  assert.equal(dueBelongsToCompletion(null, "2026-01-01", 80), false);
  assert.equal(dueBelongsToCompletion("2026-01-01", null, 80), false);
});
