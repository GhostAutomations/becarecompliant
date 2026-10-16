import { test } from "node:test";
import assert from "node:assert/strict";
import { azOtherLast } from "./az.ts";
import { CONCERN_TYPES } from "./notes.ts";
import { STARTER_TASKS, TASK_REASONS } from "./tasks.ts";

test("A to Z by the words shown, Other last, case ignored", () => {
  assert.deepEqual(azOtherLast(["Other", "fall", "Abuse", "Near miss"], (x) => x), ["Abuse", "fall", "Near miss", "Other"]);
});

test("the rota lists as the dropdowns show them", () => {
  const concerns = azOtherLast(CONCERN_TYPES, (x) => x);
  assert.equal(concerns[0], "Abuse or allegation of abuse");
  assert.equal(concerns[concerns.length - 1], "Other");
  assert.equal(concerns.length, CONCERN_TYPES.length);
  const reasons = azOtherLast(TASK_REASONS, (r) => r.label).map((r) => r.label);
  assert.equal(reasons[0], "Already done earlier");
  assert.equal(reasons[reasons.length - 1], "Other");
  const groups = azOtherLast(STARTER_TASKS, (g) => g.category).map((g) => g.category);
  assert.deepEqual(groups, ["Evening and night", "Food and drink", "Health and wellbeing", "Home and safety", "Moving around", "Out and about", "Personal care"]);
});
