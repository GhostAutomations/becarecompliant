import test from "node:test";
import assert from "node:assert/strict";
import { parseRatings, ratingLabel, ratingTone, RATING_LEVELS, selfRatingProblem, CIW_DESCRIPTORS } from "./ratings.ts";

test("CIW levels are the four CIW publishes, best first", () => {
  assert.deepEqual(RATING_LEVELS.ciw.map((l) => l.label), ["Excellent", "Good", "Requires improvement", "Requires significant improvement"]);
});
test("CQC levels are its four", () => {
  assert.deepEqual(RATING_LEVELS.cqc.map((l) => l.label), ["Outstanding", "Good", "Requires improvement", "Inadequate"]);
});
test("a blank theme is not rated, a known value is kept", () => {
  const form: Record<string, string> = { rating_W: "good", rating_CS: "", rating_LM: "excellent" };
  const r = parseRatings("ciw", ["W", "CS", "LM"], (k) => form[k] ?? null);
  assert.deepEqual(r, { ok: true, ratings: { W: "good", LM: "excellent" } });
});
test("an unknown or the other regulator's value is refused", () => {
  assert.equal(parseRatings("ciw", ["W"], () => "outstanding").ok, false);
  assert.equal(parseRatings("cqc", ["S"], () => "excellent").ok, false);
});
test("labels and tones", () => {
  assert.equal(ratingLabel("ciw", "requires_significant_improvement"), "Requires significant improvement");
  assert.equal(ratingTone("ciw", "requires_improvement"), "amber");
  assert.equal(ratingTone("cqc", "inadequate"), "red");
  assert.equal(ratingLabel("ciw", null), null);
});
test("no dashes in any label", () => {
  for (const r of ["ciw", "cqc"] as const) for (const l of RATING_LEVELS[r]) assert.doesNotMatch(l.label, /[—–-]/);
});


test("a self rating must be a level the regulator uses", () => {
  assert.equal(selfRatingProblem("ciw", "good", 0), null);
  assert.equal(selfRatingProblem("ciw", "outstanding", 0), "Choose a rating from the list.");
  assert.equal(selfRatingProblem("cqc", "outstanding", 0), null);
});

test("an open Priority Action Notice forces Requires significant improvement (CIW)", () => {
  assert.match(selfRatingProblem("ciw", "good", 1) ?? "", /Priority Action Notice/);
  assert.equal(selfRatingProblem("ciw", "requires_significant_improvement", 1), null);
});

test("every CIW level has its descriptor", () => {
  for (const v of ["excellent", "good", "requires_improvement", "requires_significant_improvement"]) {
    assert.ok(CIW_DESCRIPTORS[v]?.length > 20);
  }
});
