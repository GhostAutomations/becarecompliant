import { test } from "node:test";
import assert from "node:assert/strict";
import { checklistFor, policyReviewRag } from "./review.ts";

test("review dates read like checks", () => {
  assert.equal(policyReviewRag("2026-10-05", "2026-10-06"), "red");
  assert.equal(policyReviewRag("2026-10-06", "2026-10-06"), "amber");
  assert.equal(policyReviewRag("2026-11-05", "2026-10-06"), "amber");
  assert.equal(policyReviewRag("2026-11-06", "2026-10-06"), "green");
  assert.equal(policyReviewRag(null, "2026-10-06"), "amber");
});

test("the checklist follows the regulator", () => {
  assert.deepEqual(checklistFor("ciw"), ["ciw"]);
  assert.deepEqual(checklistFor(null), ["ciw", "cqc"]);
});
