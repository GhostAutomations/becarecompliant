import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. lookup.ts has no runtime imports for exactly this reason. */
import {
  type LookupChoice,
  exactChoice,
  filterChoices,
  lookupError,
  normalise,
} from "./lookup.ts";

const PEOPLE: LookupChoice[] = [
  { id: "1", label: "Joanne Smith", hint: "Cardiff" },
  { id: "2", label: "John Smith", hint: "Newport" },
  { id: "3", label: "Siân O'Brien", hint: "Cardiff" },
  { id: "4", label: "Gareth Davies", hint: "Newport" },
];

test("THE POINT: typing part of a name narrows the list", () => {
  assert.deepEqual(filterChoices(PEOPLE, "jo").map((c) => c.label), [
    "Joanne Smith",
    "John Smith",
  ]);
});

test("two words match across the name, in either order", () => {
  assert.deepEqual(filterChoices(PEOPLE, "jo smi").map((c) => c.label), [
    "Joanne Smith",
    "John Smith",
  ]);
  assert.deepEqual(filterChoices(PEOPLE, "smith joanne").map((c) => c.label), ["Joanne Smith"]);
});

test("surname first works, because that is how a rota reads", () => {
  assert.deepEqual(filterChoices(PEOPLE, "davies").map((c) => c.label), ["Gareth Davies"]);
});

test("accents and apostrophes do not hide a record", () => {
  assert.deepEqual(filterChoices(PEOPLE, "sian").map((c) => c.label), ["Siân O'Brien"]);
  assert.deepEqual(filterChoices(PEOPLE, "obrien").map((c) => c.label), ["Siân O'Brien"]);
  assert.equal(normalise("Siân O'Brien"), "sian o brien");
});

test("a hyphen typed or not typed finds the same record", () => {
  const both: LookupChoice[] = [
    { id: "a", label: "Ceri Smith-Jones" },
    { id: "b", label: "Alun Smith Jones" },
  ];
  // Typed with the hyphen: finds the hyphenated one, and does not lose the spaced one.
  assert.deepEqual(filterChoices(both, "smith-jones").map((c) => c.id), ["a", "b"]);
  // Typed without it: same.
  assert.deepEqual(filterChoices(both, "smith jones").map((c) => c.id), ["a", "b"]);
  assert.deepEqual(filterChoices(both, "smithjones").map((c) => c.id), ["a"]);
});

test("the branch tells two same-named records apart", () => {
  assert.deepEqual(filterChoices(PEOPLE, "smith newport").map((c) => c.label), ["John Smith"]);
});

test("an empty query browses rather than showing nothing", () => {
  assert.equal(filterChoices(PEOPLE, "").length, 4);
  assert.equal(filterChoices(PEOPLE, "   ").length, 4);
});

test("the list is capped, so two hundred service users cannot flood the screen", () => {
  const many: LookupChoice[] = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    label: `Carer Number ${i}`,
  }));
  assert.equal(filterChoices(many, "carer").length, 8);
  assert.equal(filterChoices(many, "carer", 3).length, 3);
});

test("nothing matches when nobody matches", () => {
  assert.deepEqual(filterChoices(PEOPLE, "zzz"), []);
});

test("exactChoice finds the picked record, whatever the casing", () => {
  assert.equal(exactChoice(PEOPLE, "joanne smith")?.id, "1");
  assert.equal(exactChoice(PEOPLE, "  Siân O'Brien  ".trim())?.id, "3");
  assert.equal(exactChoice(PEOPLE, "Jo"), null);
  assert.equal(exactChoice(PEOPLE, ""), null);
});

test("THE REFUSAL: a name typed freehand is not accepted as a record", () => {
  const msg = lookupError(PEOPLE, "Mrs Jones", true);
  assert.match(msg ?? "", /Pick a name from the list/);
  assert.match(msg ?? "", /add the record first/);
});

test("a picked record passes, and an optional field may be left empty", () => {
  assert.equal(lookupError(PEOPLE, "John Smith", true), null);
  assert.equal(lookupError(PEOPLE, "", false), null);
  assert.equal(lookupError(PEOPLE, "   ", false), null);
});

test("a required field says what to do when it is empty", () => {
  assert.equal(lookupError(PEOPLE, "", true), "Choose a record from the list.");
  assert.equal(lookupError(PEOPLE, null, true), "Choose a record from the list.");
});
