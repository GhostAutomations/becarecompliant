import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  daysUntil,
  dueWithin,
  lineDueWithin,
  matchesSearch,
  overdueSupervisions,
  ragFor,
  sortCards,
  supervisionsDueWithin,
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

/* --- the four boxes across the top ---------------------------------------------------- */

const BOARD: PersonCard[] = [
  card({ id: "late2", name: "Katie Fraser", nextLabel: "SUP 2", nextDue: "2026-07-30" }),
  card({ id: "late1", name: "Sophie Ellis", nextLabel: "SUP 1", nextDue: "2026-08-20" }),
  card({ id: "soon", name: "Aimee Marshall", nextLabel: "SUP 3", nextDue: "2026-09-18" }),
  card({ id: "month", name: "Naledi Moyo", nextLabel: "AA", nextDue: "2026-10-05" }),
  card({ id: "far", name: "Frances Coyle", nextLabel: "SUP 1", nextDue: "2026-12-01" }),
  card({ id: "none", name: "Elsie Pritchard-Lewis", nextLabel: null, nextDue: null }),
];

test("the overdue box names them, longest overdue first", () => {
  assert.deepEqual(
    overdueSupervisions(BOARD, TODAY).map((e) => [e.name, e.stage, e.due]),
    [
      ["Katie Fraser", "SUP 2", "2026-07-30"],
      ["Sophie Ellis", "SUP 1", "2026-08-20"],
    ],
  );
});

test("the 14 and 30 day boxes leave the overdue to the overdue box", () => {
  /* Phil's board shows 5 overdue, 2 in 14 days and 6 in 30 days -- a name in two boxes reads
     as two jobs, so overdue is counted once, in its own box. */
  assert.deepEqual(supervisionsDueWithin(BOARD, 14, TODAY).map((e) => e.id), ["soon"]);
  assert.deepEqual(supervisionsDueWithin(BOARD, 30, TODAY).map((e) => e.id), ["soon", "month"]);
});

test("the 30 day box contains the 14 day box, so the windows nest", () => {
  const fourteen = supervisionsDueWithin(BOARD, 14, TODAY).map((e) => e.id);
  const thirty = supervisionsDueWithin(BOARD, 30, TODAY).map((e) => e.id);
  assert.equal(fourteen.every((id) => thirty.includes(id)), true);
});

test("somebody with nothing due is in no box", () => {
  const boxes = [
    ...overdueSupervisions(BOARD, TODAY),
    ...supervisionsDueWithin(BOARD, 30, TODAY),
  ];
  assert.equal(boxes.some((e) => e.id === "none"), false);
});

test("the spot check box counts the overdue too, because no other box would", () => {
  const spot = (id: string, due: string | null) =>
    card({ id, name: id, lines: [{ label: "Spot Check", due, rag: "none" }] });
  const found = lineDueWithin(
    [spot("missed", "2026-06-01"), spot("soon", "2026-09-20"), spot("far", "2026-11-01"), spot("never", null)],
    "Spot Check",
    30,
    TODAY,
  );
  assert.deepEqual(found.map((e) => e.id), ["missed", "soon"]);
});

test("a line that is complete is not due", () => {
  const done = card({ id: "d", lines: [{ label: "Spot Check", due: "2026-09-10", rag: "green", done: true }] });
  assert.deepEqual(lineDueWithin([done], "Spot Check", 30, TODAY), []);
});
