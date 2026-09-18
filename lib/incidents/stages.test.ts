import { test } from "node:test";
import assert from "node:assert/strict";
import {
  incidentStage,
  investigationDue,
  outcomeDue,
  readyToClose,
  whatIsOutstanding,
} from "./stages.ts";

const reported = { investigationCompleted: null, noFurtherAction: null, outcomeRecordedOn: null };
const investigatedActionNeeded = { investigationCompleted: "2026-09-18", noFurtherAction: false, outcomeRecordedOn: null };
const investigatedNfa = { investigationCompleted: "2026-09-18", noFurtherAction: true, outcomeRecordedOn: null };
const answered = { investigationCompleted: "2026-09-18", noFurtherAction: false, outcomeRecordedOn: "2026-09-20" };

test("a case that has only been reported is waiting for its investigation", () => {
  assert.equal(incidentStage(reported), "reported");
  assert.equal(investigationDue(reported), true);
  assert.equal(outcomeDue(reported), false);
  assert.equal(whatIsOutstanding(reported), "Investigation");
});

test("an investigation that found something to do calls for an outcome", () => {
  assert.equal(incidentStage(investigatedActionNeeded), "investigated");
  assert.equal(investigationDue(investigatedActionNeeded), false);
  assert.equal(outcomeDue(investigatedActionNeeded), true);
  assert.equal(whatIsOutstanding(investigatedActionNeeded), "Outcome");
});

test("NO FURTHER ACTION finishes the case, and no outcome is asked for", () => {
  // Phil's early exit. The Outcome form is never offered on this case.
  assert.equal(outcomeDue(investigatedNfa), false);
  assert.equal(readyToClose(investigatedNfa), true);
  assert.equal(whatIsOutstanding(investigatedNfa), null);
});

test("an outcome finishes a case that needed one", () => {
  assert.equal(incidentStage(answered), "answered");
  assert.equal(outcomeDue(answered), false);
  assert.equal(readyToClose(answered), true);
  assert.equal(whatIsOutstanding(answered), null);
});

test("a case is NOT ready to close on the report alone", () => {
  assert.equal(readyToClose(reported), false);
  assert.equal(readyToClose(investigatedActionNeeded), false);
});

test("the outcome is asked for once, not again", () => {
  assert.equal(outcomeDue({ ...answered, noFurtherAction: false }), false);
});

test("an investigation with the question unanswered still asks for an outcome", () => {
  // null is not the same as "no further action": we were not told, so the case is not finished.
  const unanswered = { investigationCompleted: "2026-09-18", noFurtherAction: null, outcomeRecordedOn: null };
  assert.equal(outcomeDue(unanswered), true);
  assert.equal(readyToClose(unanswered), false);
});
