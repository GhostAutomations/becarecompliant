import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import { ALL_FORMS, filterByForm, formOptions, UNNAMED } from "./history-filter.ts";

const ROWS = [
  { id: "1", form_name: "Supervision" },
  { id: "2", form_name: "Spot Check" },
  { id: "3", form_name: "Supervision" },
  { id: "4", form_name: "Annual Appraisal" },
  { id: "5", form_name: "Supervision" },
];

test("the list offers only the forms this record actually has", () => {
  assert.deepEqual(formOptions(ROWS), [
    { name: "Annual Appraisal", count: 1 },
    { name: "Spot Check", count: 1 },
    { name: "Supervision", count: 3 },
  ]);
});

test("an empty record offers nothing to filter by", () => {
  assert.deepEqual(formOptions([]), []);
});

test("one kind of form is what comes back", () => {
  assert.deepEqual(
    filterByForm(ROWS, "Supervision").map((r) => r.id),
    ["1", "3", "5"],
  );
});

test("the order it was given is the order it comes back", () => {
  /* The page hands these over newest first; a filter must not quietly resort them. */
  assert.deepEqual(
    filterByForm([...ROWS].reverse(), "Supervision").map((r) => r.id),
    ["5", "3", "1"],
  );
});

test("everything means everything", () => {
  assert.equal(filterByForm(ROWS, ALL_FORMS).length, 5);
});

test("a form nobody has selected returns nothing rather than everything", () => {
  assert.deepEqual(filterByForm(ROWS, "Mentoring"), []);
});

test("evidence with no form name is still grouped and still findable", () => {
  const rows = [{ id: "a", form_name: null }, { id: "b", form_name: "  " }, { id: "c" }];
  assert.deepEqual(formOptions(rows), [{ name: UNNAMED, count: 3 }]);
  assert.deepEqual(filterByForm(rows, UNNAMED).map((r) => r.id), ["a", "b", "c"]);
});

test("a name is matched as it was filed, trimmed", () => {
  const rows = [{ id: "a", form_name: " Supervision " }];
  assert.deepEqual(formOptions(rows), [{ name: "Supervision", count: 1 }]);
  assert.equal(filterByForm(rows, "Supervision").length, 1);
});
