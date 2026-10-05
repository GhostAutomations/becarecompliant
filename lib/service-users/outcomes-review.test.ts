import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_OUTCOMES_REVIEW,
  describeOutcomesReview,
  outcomesReviewError,
  parseOutcomesReview,
  settingNew,
  withRecordOutcomes,
} from "./outcomes-review.ts";

const rec = [
  { id: "a", title: "Walk to the shop", target: "2026-12-01" },
  { id: "b", title: "Cook a meal", target: null },
];

test("the record decides which outcomes are asked, answers kept only for those", () => {
  const typed = parseOutcomesReview({
    current: [
      { id: "b", title: "tampered", progress: "progressing", note: "Going well" },
      { id: "zz", title: "not on record", progress: "achieved", note: "x" },
    ],
    add: "No",
  });
  const v = withRecordOutcomes(typed, rec);
  assert.deepEqual(v.current.map((l) => l.id), ["a", "b"]);
  assert.equal(v.current[1].title, "Cook a meal");
  assert.equal(v.current[1].progress, "progressing");
  assert.equal(v.current[0].progress, "");
});

test("each outcome needs progress and a note, then the new outcome question", () => {
  let v = withRecordOutcomes(EMPTY_OUTCOMES_REVIEW, rec);
  assert.match(outcomesReviewError(v)!, /Walk to the shop.*progress/);
  v = { ...v, current: v.current.map((l) => ({ ...l, progress: "no_change" as const })) };
  assert.match(outcomesReviewError(v)!, /helped/);
  v = { ...v, current: v.current.map((l) => ({ ...l, note: "n" })) };
  assert.match(outcomesReviewError(v)!, /new outcome is being set/);
  v = { ...v, add: "No" };
  assert.equal(outcomesReviewError(v), null);
  assert.equal(settingNew(v), false);
});

test("no outcomes on the record means a new one is required", () => {
  const v = withRecordOutcomes(EMPTY_OUTCOMES_REVIEW, []);
  assert.equal(v.add, "Yes");
  assert.equal(settingNew(v), true);
  assert.match(outcomesReviewError(v)!, /no outcomes yet/);
  const done = { ...v, newTitle: "See my grandson", newSupport: "Lifts arranged", newTarget: "2027-01-31" };
  assert.equal(outcomesReviewError(done), null);
});

test("a new outcome needs all three answers", () => {
  const base = { ...withRecordOutcomes(EMPTY_OUTCOMES_REVIEW, []), newTitle: "T" };
  assert.match(outcomesReviewError(base)!, /support/);
  assert.match(outcomesReviewError({ ...base, newSupport: "S" })!, /target date/);
});

test("rubbish in is dropped, not trusted", () => {
  const v = parseOutcomesReview({ current: [{ id: "a", progress: "brilliant" }, "x", null], add: "maybe", newTarget: "31/01/2027" });
  assert.equal(v.current[0].progress, "");
  assert.equal(v.current.length, 1);
  assert.equal(v.add, "");
  assert.equal(v.newTarget, "");
  assert.deepEqual(parseOutcomesReview("nonsense"), EMPTY_OUTCOMES_REVIEW);
});

test("the evidence reads in words", () => {
  const v = {
    ...withRecordOutcomes(EMPTY_OUTCOMES_REVIEW, rec),
    add: "Yes" as const,
    newTitle: "Garden",
    newSupport: "Weekly visit",
    newTarget: "2027-03-01",
  };
  v.current[0] = { ...v.current[0], progress: "achieved", note: "Did it" };
  const text = describeOutcomesReview(v);
  assert.match(text, /Walk to the shop: Achieved/);
  assert.match(text, /Cook a meal: Not answered/);
  assert.match(text, /New outcome: Garden/);
  assert.match(text, /Target date: 01\/03\/2027/);
});
