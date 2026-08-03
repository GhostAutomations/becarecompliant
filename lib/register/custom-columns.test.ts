import test from "node:test";
import assert from "node:assert/strict";

/**
 * Be Care Compliant — custom register columns (Item 6).
 *
 * RELATIVE, EXTENSIONED import on purpose: `node --experimental-strip-types --test` resolves
 * neither path aliases nor extensionless files, so the module under test must be importless at
 * runtime and reached this way.
 */
import {
  cellText,
  columnAnswerText,
  displayChoices,
  isDisplayChoice,
  MAX_REGISTER_COLUMNS,
  shownColumnCount,
} from "./custom-columns.ts";

const uk = (iso: string) => `UK(${iso})`;

const SCHEMA = {
  schemaVersion: 1,
  sections: [
    {
      id: "s1",
      title: "Details",
      fields: [
        { key: "visit_date", type: "date", label: "Date of visit" },
        { key: "notes", type: "long_text", label: "Notes" },
        { key: "name", type: "short_text", label: "Name" },
        { key: "outcome", type: "single_select", label: "Outcome", options: [
          { value: "pass", label: "Passed" },
          { value: "fail", label: "Failed" },
        ] },
      ],
    },
    {
      id: "s2",
      title: "Sign off",
      fields: [
        { key: "issued", type: "yes_no", label: "Uniform issued" },
        { key: "grade", type: "radio", label: "Grade", options: [{ value: "a", label: "A" }] },
        { key: "areas", type: "multi_select", label: "Areas", options: [] },
        { key: "score", type: "number", label: "Score" },
        { key: "sig", type: "signature", label: "Signature" },
      ],
    },
  ],
} as never;

test("displayChoices offers dates and choices, in document order", () => {
  const got = displayChoices(SCHEMA);
  assert.deepEqual(
    got.map((c) => c.key),
    ["visit_date", "outcome", "issued", "grade"],
  );
  assert.equal(got[0].kind, "date");
  assert.equal(got[1].kind, "choice");
});

test("displayChoices never offers free text, numbers, signatures or a multi select", () => {
  const keys = displayChoices(SCHEMA).map((c) => c.key);
  for (const banned of ["notes", "name", "areas", "score", "sig"]) {
    assert.equal(keys.includes(banned), false, `${banned} must not be offerable`);
  }
});

test("displayChoices survives a missing or malformed schema", () => {
  assert.deepEqual(displayChoices(null), []);
  assert.deepEqual(displayChoices(undefined), []);
  assert.deepEqual(displayChoices({ schemaVersion: 1 } as never), []);
});

test("displayChoices falls back to the key when a question has no label", () => {
  const s = { sections: [{ id: "a", title: "A", fields: [{ key: "k", type: "date", label: "" }] }] } as never;
  assert.equal(displayChoices(s)[0].label, "k");
});

test("null is always a legal choice: it means the next due date", () => {
  assert.equal(isDisplayChoice([], null), true);
});

test("a question key the browser invented is refused", () => {
  const choices = displayChoices(SCHEMA);
  assert.equal(isDisplayChoice(choices, "outcome"), true);
  assert.equal(isDisplayChoice(choices, "notes"), false);
  assert.equal(isDisplayChoice(choices, "made_up"), false);
});

test("columnAnswerText reads a date through the app formatter, never its own", () => {
  const field = { type: "date" };
  assert.equal(columnAnswerText(field, "2027-03-04", uk), "UK(2027-03-04)");
});

test("columnAnswerText shows the option LABEL, not the stored value", () => {
  const field = { type: "single_select", options: [{ value: "pass", label: "Passed" }] };
  assert.equal(columnAnswerText(field, "pass", uk), "Passed");
});

test("columnAnswerText falls back to the raw value when the option is gone", () => {
  const field = { type: "single_select", options: [{ value: "pass", label: "Passed" }] };
  assert.equal(columnAnswerText(field, "retired_value", uk), "retired_value");
});

test("columnAnswerText words a yes/no answer in the shape the form actually stores", () => {
  // lib/form-validate.ts stores the WORDS "Yes"/"No". The rest are older or imported shapes.
  assert.equal(columnAnswerText({ type: "yes_no" }, "Yes", uk), "Yes");
  assert.equal(columnAnswerText({ type: "yes_no" }, "No", uk), "No");
  assert.equal(columnAnswerText({ type: "yes_no" }, true, uk), "Yes");
  assert.equal(columnAnswerText({ type: "yes_no" }, false, uk), "No");
  assert.equal(columnAnswerText({ type: "yes_no" }, "yes", uk), "Yes");
});

test("columnAnswerText treats nothing recorded as empty, including false-y blanks", () => {
  assert.equal(columnAnswerText({ type: "date" }, null, uk), "");
  assert.equal(columnAnswerText({ type: "date" }, undefined, uk), "");
  assert.equal(columnAnswerText({ type: "date" }, "   ", uk), "");
  assert.equal(columnAnswerText(undefined, "anything", uk), "");
});

test("columnAnswerText refuses a set of answers rather than printing an array", () => {
  assert.equal(columnAnswerText({ type: "multi_select" }, ["a", "b"], uk), "");
});

test("columnAnswerText never renders [object Object] when a question changed type", () => {
  assert.equal(columnAnswerText({ type: "single_select" }, { line1: "1 High St" }, uk), "");
});

test("the cap counts only SHOWN columns", () => {
  assert.equal(shownColumnCount([{ show: true }, { show: false }, { show: true }]), 2);
});

test("the cap trips at one over the limit, not at the limit", () => {
  const at = Array.from({ length: MAX_REGISTER_COLUMNS }, () => ({ show: true }));
  assert.equal(shownColumnCount(at) > MAX_REGISTER_COLUMNS, false);
  assert.equal(shownColumnCount([...at, { show: true }]) > MAX_REGISTER_COLUMNS, true);
  assert.equal(shownColumnCount([...at, { show: false }]) > MAX_REGISTER_COLUMNS, false);
});

test("cellText leaves a due-date column alone", () => {
  const text = cellText({ displayFieldKey: null }, { last_evidence_id: "e1" }, { e1: "Passed" });
  assert.equal(text, undefined, "undefined means fall back to the due date");
});

test("cellText falls back to the DUE DATE when there is no evidence to read", () => {
  // Migrated history carries no evidence id. Blanking those cells would read as "never done".
  assert.equal(cellText({ displayFieldKey: "outcome" }, undefined, {}), undefined);
  assert.equal(cellText({ displayFieldKey: "outcome" }, { last_evidence_id: null }, {}), undefined);
});

test("cellText reads the answer for that cell's own evidence", () => {
  const byEvidence = { e1: "Passed", e2: "Failed" };
  assert.equal(cellText({ displayFieldKey: "outcome" }, { last_evidence_id: "e2" }, byEvidence), "Failed");
});

test("cellText falls back to the DUE DATE when the evidence could not be read", () => {
  // RLS hid it, or the read failed. Either way the viewer keeps the information they DO have.
  assert.equal(cellText({ displayFieldKey: "outcome" }, { last_evidence_id: "gone" }, {}), undefined);
});

test("cellText is empty ONLY when the evidence was read and that question was blank", () => {
  assert.equal(cellText({ displayFieldKey: "outcome" }, { last_evidence_id: "e1" }, { e1: "" }), "");
});

test("displayChoices carries the field type and options, so no schema snapshot is needed", () => {
  const outcome = displayChoices(SCHEMA).find((c) => c.key === "outcome");
  assert.equal(outcome?.type, "single_select");
  assert.deepEqual(outcome?.options, [
    { value: "pass", label: "Passed" },
    { value: "fail", label: "Failed" },
  ]);
  assert.equal(columnAnswerText(outcome, "fail", uk), "Failed");
});
