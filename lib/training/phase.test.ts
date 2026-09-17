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

/*
 * POOLED, NOT AVERAGED (Phil, 2026-09-17): "they cannot not be an average needs to be the actual
 * score for each phase." The branch headline pools every cell in the phase and scores the pile,
 * which is why phaseProgress takes cells rather than percentages.
 */
test("a branch score pools cells, it does not average people", () => {
  // One carer with 13 phase 1 courses, 12 in date. One new starter with 2, none in date.
  const veteran = Array.from({ length: 13 }, (_, i) => ({ rag: i < 12 ? "green" : "red" }));
  const starter = [{ rag: "red" }, { rag: "red" }];

  const pooled = phaseProgress([...veteran, ...starter]);
  assert.equal(pooled?.done, 12);
  assert.equal(pooled?.total, 15);
  assert.equal(pooled?.pct, 80);

  // Averaging the two bars would read 46%, which is the figure this test exists to rule out.
  const averaged = Math.floor(((phaseProgress(veteran)!.pct + phaseProgress(starter)!.pct) / 2));
  assert.equal(averaged, 46);
  assert.notEqual(pooled?.pct, averaged);
});

test("a pooled phase nobody has any courses in is a dash, not zero", () => {
  assert.equal(phaseProgress([]), null);
});
