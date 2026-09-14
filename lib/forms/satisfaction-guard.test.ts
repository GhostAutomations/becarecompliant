import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { satisfactionEditsIn, satisfactionRefusal } from "./satisfaction-guard.ts";
import type { FormSchema } from "../form-schema.ts";

function schema(fields: Array<Record<string, unknown>>): FormSchema {
  return { schemaVersion: 1, sections: [{ id: "s", title: "Customer Satisfaction", fields: fields as never }] } as FormSchema;
}

const CURRENT = schema([
  { key: "schedule_matches", type: "single_select", label: "Does this match?", satisfaction: true },
  { key: "schedule_changes", type: "long_text", label: "What is different?" },
  { key: "notes", type: "long_text", label: "Notes" },
]);

describe("the builder may not move the scoring", () => {
  it("allows a draft that leaves the scored questions alone", () => {
    const next = schema([
      { key: "schedule_matches", type: "single_select", label: "Does this match?", satisfaction: true },
      { key: "schedule_changes", type: "long_text", label: "What changed?" },
      { key: "notes", type: "long_text", label: "Notes and observations" },
    ]);
    assert.deepEqual(satisfactionEditsIn(CURRENT, next), []);
  });

  it("refuses a scored question being deleted", () => {
    const next = schema([{ key: "notes", type: "long_text", label: "Notes" }]);
    assert.deepEqual(satisfactionEditsIn(CURRENT, next), ['"Does this match?" would be removed']);
  });

  it("refuses a scored question being reworded", () => {
    const next = schema([
      { key: "schedule_matches", type: "single_select", label: "Happy with times?", satisfaction: true },
    ]);
    assert.deepEqual(satisfactionEditsIn(CURRENT, next), ['"Does this match?" would be reworded']);
  });

  it("refuses a new scored question being smuggled in", () => {
    const next = schema([
      { key: "schedule_matches", type: "single_select", label: "Does this match?", satisfaction: true },
      { key: "sneaky", type: "single_select", label: "All fine?", satisfaction: true },
    ]);
    assert.deepEqual(satisfactionEditsIn(CURRENT, next), ['"All fine?" would be added as a scored question']);
  });

  it("does not care which section a scored question sits in", () => {
    const moved: FormSchema = {
      schemaVersion: 1,
      sections: [
        { id: "a", title: "Elsewhere", fields: [
          { key: "schedule_matches", type: "single_select", label: "Does this match?", satisfaction: true },
        ] as never },
        { id: "b", title: "Customer Satisfaction", fields: [
          { key: "schedule_changes", type: "long_text", label: "What is different?" },
          { key: "notes", type: "long_text", label: "Notes" },
        ] as never },
      ],
    } as FormSchema;
    assert.deepEqual(satisfactionEditsIn(CURRENT, moved), [], "arranging the form stays theirs");
  });

  it("names every change at once rather than one at a time", () => {
    const two = schema([{ key: "x", type: "single_select", label: "New one", satisfaction: true }]);
    const problems = satisfactionEditsIn(CURRENT, two);
    assert.equal(problems.length, 2);
    assert.match(satisfactionRefusal(problems), /Settings, Service users, Customer Satisfaction/);
  });
});
