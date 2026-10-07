import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import { stageDueAfterNewAbsence } from "./next-stage.ts";

const STAGES = [1, 2, 3, 4];

test("a new absence after a Stage 1 meeting makes Stage 2 due", () => {
  assert.equal(stageDueAfterNewAbsence(1, 1, STAGES), 2);
  assert.equal(stageDueAfterNewAbsence(1, 2, STAGES), 2);
});

test("no meeting, or nothing since it, changes nothing", () => {
  assert.equal(stageDueAfterNewAbsence(null, 3, STAGES), null);
  assert.equal(stageDueAfterNewAbsence(1, 0, STAGES), null);
});

test("there is nothing after the last stage", () => {
  assert.equal(stageDueAfterNewAbsence(4, 1, STAGES), null);
});

test("stages need not be numbered from one or in order", () => {
  assert.equal(stageDueAfterNewAbsence(2, 1, [3, 2, 5]), 3);
});
