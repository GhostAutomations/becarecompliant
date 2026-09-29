import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_ACTIONS,
  isStageAction,
  stageActionFor,
  stageActionSentence,
  stageActionLines,
  warningAllowed,
  warningTooHighMessage,
} from "./stage-actions.ts";

// Thistle's policy as Phil gave it, 2026-09-29.
const thistle = {
  method: "stages" as const,
  thresholds: [
    { stage: 1, label: "Stage 1", occasions: 3, action: "Verbal warning" },
    { stage: 2, label: "Stage 2", occasions: 4, action: "Written warning" },
    { stage: 3, label: "Stage 3", occasions: 5, action: "Final written warning" },
    { stage: 4, label: "Stage 4", occasions: 6, action: "Dismissal" },
  ],
};

test("each stage reads its own action, and nothing is invented", () => {
  assert.equal(stageActionFor(thistle, 1), "Verbal warning");
  assert.equal(stageActionFor(thistle, 4), "Dismissal");
  assert.equal(stageActionFor(thistle, 5), null);
  assert.equal(stageActionFor({ ...thistle, method: "bradford" }, 1), null);
  assert.equal(stageActionFor({ method: "stages", thresholds: [{ stage: 1, label: "Stage 1", action: "Sacked" }] }, 1), null);
  assert.equal(stageActionFor({ method: "stages", thresholds: [{ stage: 1, label: "Stage 1" }] }, 1), null);
  assert.ok(STAGE_ACTIONS.every(isStageAction));
});

test("the invitation sentence, and none when no action is set", () => {
  assert.equal(
    stageActionSentence(1, "Verbal warning"),
    "This is a Stage 1 meeting and its outcome could be up to and including a verbal warning.",
  );
  assert.equal(
    stageActionSentence(4, "Dismissal"),
    "This is a Stage 4 meeting and its outcome could be up to and including dismissal.",
  );
  assert.match(stageActionSentence(1, "Informal discussion"), /no formal warning/);
  assert.equal(stageActionSentence(2, null), "");
  for (const a of STAGE_ACTIONS) assert.doesNotMatch(stageActionSentence(1, a), /[–—]| - /);
});

test("a warning must be within what the stage allows", () => {
  assert.equal(warningAllowed("Verbal warning", "None"), true);
  assert.equal(warningAllowed("Verbal warning", "Verbal warning"), true);
  assert.equal(warningAllowed("Verbal warning", "Written warning"), false);
  assert.equal(warningAllowed("Final written warning", "Dismissal"), false);
  assert.equal(warningAllowed("Dismissal", "Dismissal"), true);
  assert.equal(warningAllowed("Informal discussion", "Verbal warning"), false);
  assert.equal(warningAllowed(null, "Dismissal"), true);
  assert.equal(warningAllowed("Written warning", "First written warning"), true);
  assert.equal(warningAllowed("Written warning", ""), true);
  assert.match(warningTooHighMessage(1, "Verbal warning"), /up to and including a verbal warning/);
  assert.match(warningTooHighMessage(1, "No formal action"), /allows no formal warning/);
});

test("help lines list only the stages with an action, in stage order", () => {
  assert.deepEqual(stageActionLines({ method: "stages", thresholds: [...thistle.thresholds].reverse() }), [
    "Stage 1: up to and including a verbal warning",
    "Stage 2: up to and including a written warning",
    "Stage 3: up to and including a final written warning",
    "Stage 4: up to and including dismissal",
  ]);
  assert.deepEqual(stageActionLines({ method: "stages", thresholds: [{ stage: 1, label: "Stage 1" }] }), []);
});
