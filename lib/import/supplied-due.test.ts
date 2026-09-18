import { test } from "node:test";
import assert from "node:assert/strict";
import { settleSuppliedDue } from "./supplied-due.ts";

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
