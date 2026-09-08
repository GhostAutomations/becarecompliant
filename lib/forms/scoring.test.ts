import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOT_APPLICABLE,
  combineTotals,
  isComplete,
  scoreBand,
  scoreLabel,
  scoreProgress,
  scoreTotal,
} from "./scoring.ts";

const KEYS = ["a", "b", "c"];

/* Thistle's table, written against the full 63 point scale. */
const BANDS = [
  { upTo: 15, label: "Unsatisfactory" },
  { upTo: 30, label: "Improvement Needed" },
  { upTo: 50, label: "Achieving Required Standard" },
  { upTo: 63, label: "Exceeding Required Standard" },
];

test("a full house scores everything", () => {
  assert.deepEqual(scoreTotal({ a: "3", b: "3", c: "3" }, KEYS), {
    score: 9,
    outOf: 9,
    counted: 3,
    notApplicable: 0,
    asked: 3,
  });
});

test("not applicable is left out of the score AND out of what was available", () => {
  assert.deepEqual(scoreTotal({ a: "3", b: NOT_APPLICABLE, c: "3" }, KEYS), {
    score: 6,
    outOf: 6,
    counted: 2,
    notApplicable: 1,
    asked: 3,
  });
});

test("a zero is a score, not a missing answer", () => {
  const t = scoreTotal({ a: "0", b: "3", c: "3" }, KEYS);
  assert.equal(t.score, 6);
  assert.equal(t.counted, 3);
  assert.equal(t.outOf, 9);
});

test("an unanswered question is not counted as available yet", () => {
  /* A half filled form reads 6 of 6, never 6 of 9: the running total stays true. */
  assert.deepEqual(scoreTotal({ a: "3", b: "3" }, KEYS), {
    score: 6,
    outOf: 6,
    counted: 2,
    notApplicable: 0,
    asked: 3,
  });
});

test("an empty form scores nothing out of nothing", () => {
  assert.deepEqual(scoreTotal({}, KEYS), {
    score: 0,
    outOf: 0,
    counted: 0,
    notApplicable: 0,
    asked: 3,
  });
});

test("rubbish in an answer is ignored rather than counted as a score", () => {
  const t = scoreTotal({ a: "three", b: "3", c: "3" }, KEYS);
  assert.equal(t.score, 6);
  assert.equal(t.counted, 2);
});

test("sections add together, N/A counts and all", () => {
  const a = scoreTotal({ a: "3", b: NOT_APPLICABLE, c: "2" }, KEYS);
  const b = scoreTotal({ a: "1", b: "1", c: "1" }, KEYS);
  assert.deepEqual(combineTotals([a, b]), {
    score: 8,
    outOf: 15,
    counted: 5,
    notApplicable: 1,
    asked: 6,
  });
});

test("the band comes off the share of what was available", () => {
  const full = { score: 63, outOf: 63, counted: 21, notApplicable: 0, asked: 21 };
  assert.equal(scoreBand(full, BANDS, 63), "Exceeding Required Standard");
  assert.equal(scoreBand({ ...full, score: 40 }, BANDS, 63), "Achieving Required Standard");
  assert.equal(scoreBand({ ...full, score: 20 }, BANDS, 63), "Improvement Needed");
  assert.equal(scoreBand({ ...full, score: 10 }, BANDS, 63), "Unsatisfactory");
});

test("five N/As no longer cap somebody out of the top band", () => {
  /* The whole reason the band is a share: 48 of 48 is a perfect appraisal. */
  const capped = { score: 48, outOf: 48, counted: 16, notApplicable: 5, asked: 21 };
  assert.equal(scoreBand(capped, BANDS, 63), "Exceeding Required Standard");
});

test("the band boundaries are inclusive, as the table is written", () => {
  assert.equal(scoreBand({ score: 15, outOf: 63, counted: 21, notApplicable: 0, asked: 21 }, BANDS, 63), "Unsatisfactory");
  assert.equal(scoreBand({ score: 16, outOf: 63, counted: 21, notApplicable: 0, asked: 21 }, BANDS, 63), "Improvement Needed");
  assert.equal(scoreBand({ score: 30, outOf: 63, counted: 21, notApplicable: 0, asked: 21 }, BANDS, 63), "Improvement Needed");
  assert.equal(scoreBand({ score: 31, outOf: 63, counted: 21, notApplicable: 0, asked: 21 }, BANDS, 63), "Achieving Required Standard");
});

test("nothing scored yet has no band, because no band is honest about an empty form", () => {
  assert.equal(
    scoreBand({ score: 0, outOf: 0, counted: 0, notApplicable: 0, asked: 21 }, BANDS, 63),
    null,
  );
});

test("every question marked N/A has no band either", () => {
  const t = scoreTotal({ a: NOT_APPLICABLE, b: NOT_APPLICABLE, c: NOT_APPLICABLE }, KEYS);
  assert.equal(t.outOf, 0);
  assert.equal(scoreBand(t, BANDS, 63), null);
});

test("the label always carries the denominator", () => {
  assert.equal(
    scoreLabel({ score: 48, outOf: 48, counted: 16, notApplicable: 5, asked: 21 }),
    "48 of 48",
  );
  assert.equal(scoreLabel({ score: 0, outOf: 0, counted: 0, notApplicable: 0, asked: 21 }), "0 of 0");
});

test("a half filled form has no band at all, however well it is going", () => {
  /* Phil, 2026-09-08: two threes out of twenty one must not read "Exceeding". */
  const t = scoreTotal({ a: "3", b: "3" }, KEYS);
  assert.equal(scoreLabel(t), "6 of 6");
  assert.equal(scoreBand(t, BANDS, 63), null);
});

test("the last answer is what makes the band appear", () => {
  const almost = scoreTotal({ a: "3", b: "3" }, KEYS);
  const done = scoreTotal({ a: "3", b: "3", c: "3" }, KEYS);
  assert.equal(scoreBand(almost, BANDS, 63), null);
  assert.equal(scoreBand(done, BANDS, 63), "Exceeding Required Standard");
});

test("N/A counts as having answered, so an N/A does not hold the band back", () => {
  const t = scoreTotal({ a: "3", b: NOT_APPLICABLE, c: "3" }, KEYS);
  assert.equal(isComplete(t), true);
  assert.equal(scoreBand(t, BANDS, 63), "Exceeding Required Standard");
});

test("a total covering no questions is never complete", () => {
  assert.equal(isComplete(scoreTotal({}, [])), false);
});

test("the hint counts the answers while filling in and the score once finished", () => {
  assert.equal(scoreProgress(scoreTotal({ a: "3", b: "3" }, KEYS)), "2 of 3 answered");
  assert.equal(scoreProgress(scoreTotal({}, KEYS)), "0 of 3 answered");
  assert.equal(scoreProgress(scoreTotal({ a: "3", b: "2", c: "1" }, KEYS)), "6 of 9");
  assert.equal(
    scoreProgress(scoreTotal({ a: "3", b: NOT_APPLICABLE, c: "1" }, KEYS)),
    "4 of 6",
  );
});
