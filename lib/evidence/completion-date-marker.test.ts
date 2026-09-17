import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKeyOf } from "./completion-date.ts";

const schema = (fields: Array<Record<string, unknown>>) => ({ sections: [{ fields }] });

test("a marked field wins, wherever it sits", () => {
  /* Phil, 2026-09-17: "For supervisions, appraisals, reviews and probations, ask for date of
     completion ... and that is the date that should go into the matrix." */
  const s = schema([
    { key: "date_of_last_review", type: "date" },
    { key: "review_date", type: "date", completionDate: true },
  ]);
  assert.equal(dateKeyOf(s), "review_date");
});

test("the Individual Plan Review case, exactly as it was", () => {
  /* Its ONLY date question was Date of Last Review: the PREVIOUS one. Every completed review was
     stamped with the date of the review before it, in the Done column and in the next due date
     worked out from it. Unmarked, that is still what the old rule returns, which is why the fix
     is a marked field and not a reordering. */
  const before = schema([{ key: "date_of_last_review", type: "date" }]);
  assert.equal(dateKeyOf(before), "date_of_last_review");
});

test("an unmarked form keeps the first date question", () => {
  // Marking one form must not change another. Most forms will never carry the flag.
  const s = schema([
    { key: "supervision_date", type: "date" },
    { key: "employee_actions_timescale", type: "date" },
  ]);
  assert.equal(dateKeyOf(s), "supervision_date");
});

test("the marker is only honoured on a date field", () => {
  const s = schema([
    { key: "notes", type: "long_text", completionDate: true },
    { key: "supervision_date", type: "date" },
  ]);
  assert.equal(dateKeyOf(s), "supervision_date");
});

test("a marked field in a later section still wins", () => {
  const s = {
    sections: [
      { fields: [{ key: "date_of_last_review", type: "date" }] },
      { fields: [{ key: "review_date", type: "date", completionDate: true }] },
    ],
  };
  assert.equal(dateKeyOf(s), "review_date");
});

test("nonsense in, null out", () => {
  assert.equal(dateKeyOf(null), null);
  assert.equal(dateKeyOf({}), null);
  assert.equal(dateKeyOf(schema([{ key: "notes", type: "long_text" }])), null);
});
