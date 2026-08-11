import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import { describeValidationErrors } from "./validation-message.ts";
import type { FormSchema } from "../form-schema.ts";

/**
 * The case this exists for: completing Supervision 4 refused with "Please correct the
 * highlighted fields" and NOTHING highlighted, because the page hides "Which
 * supervision" and supplies the value itself while the server checks the whole form.
 */
const schema = {
  schemaVersion: 1,
  sections: [
    {
      id: "s1",
      title: "Supervision details",
      fields: [
        { key: "supervision_type", type: "single_select", label: "Which supervision", options: [] },
        { key: "supervision_date", type: "date", label: "Date of supervision" },
        { key: "wellbeing", type: "long_text", label: "Wellbeing and any concerns" },
        { key: "workload", type: "long_text", label: "Workload and capacity" },
      ],
    },
  ],
} as unknown as FormSchema;

test("a refusal names the field the manager cannot see", () => {
  const msg = describeValidationErrors(schema, [
    { key: "supervision_type", message: "Choose one of the options." },
  ]);
  assert.match(msg, /Which supervision/);
  assert.match(msg, /choose one of the options/);
  assert.doesNotMatch(msg, /highlighted/);
});

test("several fields are listed", () => {
  const msg = describeValidationErrors(schema, [
    { key: "supervision_type", message: "Choose one of the options." },
    { key: "wellbeing", message: "This field is required." },
  ]);
  assert.match(msg, /Which supervision/);
  assert.match(msg, /Wellbeing and any concerns/);
});

test("a long list is capped and the rest counted, so the line stays readable", () => {
  const msg = describeValidationErrors(schema, [
    { key: "supervision_type", message: "Choose one of the options." },
    { key: "supervision_date", message: "Enter a valid date." },
    { key: "wellbeing", message: "This field is required." },
    { key: "workload", message: "This field is required." },
  ]);
  assert.match(msg, /And 1 more\./);
  assert.doesNotMatch(msg, /Workload and capacity/);
});

// A key the schema has never heard of must still produce something, not "undefined".
test("an unknown key falls back to the key rather than printing nothing", () => {
  const msg = describeValidationErrors(schema, [{ key: "ghost_field", message: "Invalid value." }]);
  assert.match(msg, /ghost_field/);
});

test("no errors keeps the old generic sentence", () => {
  assert.equal(describeValidationErrors(schema, []), "Please correct the highlighted fields.");
});
