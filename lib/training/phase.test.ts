import test from "node:test";
import assert from "node:assert/strict";
import { phaseProgress } from "./phase.ts";

const g = { rag: "green" };
const a = { rag: "amber" };
const r = { rag: "red" };

test("the share of the phase that is in date", () => {
  assert.deepEqual(phaseProgress([g, g, g, r]), { done: 3, total: 4, pct: 75 });
  assert.deepEqual(phaseProgress([g, g, g, g]), { done: 4, total: 4, pct: 100 });
  assert.deepEqual(phaseProgress([r, r]), { done: 0, total: 2, pct: 0 });
});

test("amber counts as in date, the same as mandatory compliance scores it", () => {
  // Otherwise the bar says one thing while the headline percentage says another.
  assert.deepEqual(phaseProgress([g, a, r]), { done: 2, total: 3, pct: 66 });
});

test("a course that is not theirs is not counted", () => {
  // Scoped courses arrive as undefined, the same as they do on the matrix: a supervisor
  // course is not a gap on a care assistant and must not drag her bar down.
  assert.deepEqual(phaseProgress([g, undefined, g, undefined]), { done: 2, total: 2, pct: 100 });
});

/* AN EMPTY PHASE IS NOT A FINISHED ONE. A bar reading 100% because nothing was asked of
   somebody is the kind of green that gets a company inspected. */
test("nothing in the phase for this person is null, not a hundred percent", () => {
  assert.equal(phaseProgress([]), null);
  assert.equal(phaseProgress([undefined, undefined]), null);
});

test("rounded down, never up", () => {
  // Twelve of thirteen is 92, not 100: a bar that rounds up before the last course is done
  // lies on the day it matters most.
  const twelveOfThirteen = [...Array(12).fill(g), r];
  assert.equal(phaseProgress(twelveOfThirteen)?.pct, 92);
  const oneOfThree = [g, r, r];
  assert.equal(phaseProgress(oneOfThree)?.pct, 33);
});
