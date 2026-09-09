import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  daysUntil,
  dueWithin,
  matchesSearch,
  ragFor,
  sortCards,
  worseRag,
  type PersonCard,
} from "./summary-card.ts";

const TODAY = "2026-09-09";

const card = (over: Partial<PersonCard>): PersonCard => ({
  id: "1",
  name: "Joe Bloggs",
  subtitle: "Care Assistant · Cardiff",
  chips: [],
  lines: [],
  nextLabel: null,
  nextDue: null,
  nextRag: "none",
  inDate: 0,
  scheduled: 0,
  worst: "none",
  ...over,
});

test("days are counted from today, forwards and backwards", () => {
  assert.equal(daysUntil("2026-09-09", TODAY), 0);
  assert.equal(daysUntil("2026-09-10", TODAY), 1);
  assert.equal(daysUntil("2026-09-01", TODAY), -8);
  assert.equal(daysUntil(null, TODAY), null);
  assert.equal(daysUntil("not a date", TODAY), null);
});

test("a date that has passed is red, whatever the amber window", () => {
  assert.equal(ragFor("2026-09-08", TODAY, 30), "red");
  assert.equal(ragFor("2026-09-08", TODAY, 0), "red");
});

test("today is amber, not red: it has not been missed until the day is out", () => {
  assert.equal(ragFor(TODAY, TODAY, 30), "amber");
});

test("inside the window is amber, beyond it is green", () => {
  assert.equal(ragFor("2026-10-01", TODAY, 30), "amber");
  assert.equal(ragFor("2026-10-10", TODAY, 30), "green");
});

test("nothing scheduled is not a colour", () => {
  assert.equal(ragFor(null, TODAY, 30), "none");
});

test("the worse of two colours wins", () => {
  assert.equal(worseRag("green", "red"), "red");
  assert.equal(worseRag("amber", "green"), "amber");
  assert.equal(worseRag("none", "green"), "green");
  assert.equal(worseRag("red", "amber"), "red");
});

test("a 14 day filter catches what is due AND what is already overdue", () => {
  /* Something due last month is more urgent than something due next week, not less. */
  const soon = card({ lines: [{ label: "Spot Check", due: "2026-09-15", rag: "amber" }] });
  const late = card({ lines: [{ label: "Spot Check", due: "2026-08-01", rag: "red" }] });
  const far = card({ lines: [{ label: "Spot Check", due: "2026-12-01", rag: "green" }] });
  assert.equal(dueWithin(soon, 14, TODAY), true);
  assert.equal(dueWithin(late, 14, TODAY), true);
  assert.equal(dueWithin(far, 14, TODAY), false);
});

test("a card with nothing scheduled is in no due window", () => {
  assert.equal(dueWithin(card({ lines: [{ label: "x", due: null, rag: "none" }] }), 30, TODAY), false);
});

test("search reads the name and the line under it", () => {
  const c = card({});
  assert.equal(matchesSearch(c, ""), true);
  assert.equal(matchesSearch(c, "joe"), true);
  assert.equal(matchesSearch(c, "  BLOGGS "), true);
  assert.equal(matchesSearch(c, "cardiff"), true);
  assert.equal(matchesSearch(c, "newport"), false);
});

test("the people who need doing are at the top", () => {
  const sorted = sortCards([
    card({ id: "green", name: "Zoe", worst: "green", nextDue: "2026-12-01" }),
    card({ id: "red", name: "Ann", worst: "red", nextDue: "2026-08-01" }),
    card({ id: "amber", name: "Bob", worst: "amber", nextDue: "2026-09-20" }),
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ["red", "amber", "green"]);
});

test("same colour sorts by soonest due, then by name", () => {
  const sorted = sortCards([
    card({ id: "later", name: "Ann", worst: "amber", nextDue: "2026-09-30" }),
    card({ id: "sooner", name: "Zoe", worst: "amber", nextDue: "2026-09-10" }),
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ["sooner", "later"]);
});

test("sorting does not mutate what it was given", () => {
  const input = [card({ id: "a", worst: "green" }), card({ id: "b", worst: "red" })];
  sortCards(input);
  assert.deepEqual(input.map((c) => c.id), ["a", "b"]);
});
