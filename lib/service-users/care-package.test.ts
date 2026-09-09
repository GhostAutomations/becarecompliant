import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  callsPerWeek,
  describePackage,
  linesFromRows,
  packageRows,
  parsePackage,
  type PackageLine,
} from "./care-package.ts";

const line = (over: Partial<PackageLine>): PackageLine => ({
  service: "Care",
  days: [0],
  slot: "morning",
  unit: "30m",
  carers: 1,
  quantity: 1,
  ...over,
});

const SERVICES = ["Care", "Sit", "Overnight", "Sleep", "Shopping", "Cleaning"];
const UNITS = ["15m", "30m", "45m", "1hr", "2hr", "Fixed"];
const opts = { services: SERVICES, units: UNITS };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

test("a real package: two calls a day, a Tuesday sit and a Friday shop", () => {
  const lines = parsePackage(
    [
      { service: "Care", days: EVERY_DAY, slot: "morning", unit: "45m", carers: 2 },
      { service: "Care", days: EVERY_DAY, slot: "evening", unit: "30m", carers: 1 },
      { service: "Sit", days: [1], slot: "afternoon", unit: "2hr", carers: 1 },
      { service: "Shopping", days: [4], slot: "lunch", unit: "1hr", carers: 1 },
    ],
    opts,
  );
  assert.equal(lines.length, 4);
  assert.equal(callsPerWeek(lines), 7 + 7 + 1 + 1);
});

test("a line with no days is not a call", () => {
  assert.deepEqual(parsePackage([{ service: "Care", days: [], slot: "morning", unit: "30m" }], opts), []);
});

test("a service, unit or slot the form never offered is dropped, not trusted", () => {
  /* The answer arrives as JSON from a browser. Anything not in the stored schema's own lists
     is somebody's invention and must not reach the invoice. */
  const bad = parsePackage(
    [
      { service: "Physiotherapy", days: [0], slot: "morning", unit: "30m" },
      { service: "Care", days: [0], slot: "morning", unit: "17m" },
      { service: "Care", days: [0], slot: "teatime", unit: "30m" },
    ],
    opts,
  );
  assert.deepEqual(bad, []);
});

test("days outside the week are dropped and duplicates collapse", () => {
  const [line] = parsePackage(
    [{ service: "Care", days: [0, 0, 3, 9, -1, 6], slot: "morning", unit: "30m" }], opts,
  );
  assert.deepEqual(line.days, [0, 3, 6]);
});

test("carers is clamped to 1 to 4, and rubbish never bills more", () => {
  const read = (carers: unknown) =>
    parsePackage([{ service: "Care", days: [0], slot: "morning", unit: "30m", carers }], opts)[0].carers;
  assert.equal(read(3), 3);
  assert.equal(read(0), 1);
  assert.equal(read(-2), 1);
  assert.equal(read(99), 4);
  assert.equal(read("nonsense"), 1);
  assert.equal(read(undefined), 1);
});

test("rubbish where a package should be is survived, not thrown on", () => {
  assert.deepEqual(parsePackage(null, opts), []);
  assert.deepEqual(parsePackage(undefined, opts), []);
  assert.deepEqual(parsePackage("nope", opts), []);
  assert.deepEqual(parsePackage([null, 7, "x", []], opts), []);
});

test("a package cannot be made enormous by a crafted answer", () => {
  const many = Array.from({ length: 200 }, () => ({
    service: "Care", days: EVERY_DAY, slot: "morning", unit: "1hr", carers: 4,
  }));
  assert.equal(parsePackage(many, opts).length, 20);
});

test("every call becomes one Care Plan row, on every day it happens", () => {
  const lines: PackageLine[] = [
    line({ days: EVERY_DAY, slot: "morning", unit: "45m", carers: 2 }),
    line({ service: "Shopping", days: [4], slot: "lunch", unit: "1hr" }),
  ];
  const rows = packageRows(lines);
  assert.equal(rows.length, 8);
  assert.equal(rows.filter((r) => r.day_of_week === 4).length, 2);
  assert.equal(rows.filter((r) => r.day_of_week === 0).length, 1);
  assert.equal(rows.every((r) => r.quantity === 1), true);
});

test("the week reads in the order the calls actually happen", () => {
  /* Typed evening-first; the plan still runs morning, lunch, evening within each day. */
  const rows = packageRows([
    line({ days: [0, 1], slot: "evening" }),
    line({ days: [0, 1], slot: "morning", unit: "45m", carers: 2 }),
    line({ service: "Shopping", days: [0], slot: "lunch", unit: "1hr" }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.day_of_week, r.slot]),
    [
      [0, "morning"],
      [0, "lunch"],
      [0, "evening"],
      [1, "morning"],
      [1, "evening"],
    ],
  );
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2, 3, 4]);
});

test("two calls in the same slot both survive, they are two visits", () => {
  const rows = packageRows([
    line({ days: [0], slot: "morning", unit: "30m" }),
    line({ days: [0], slot: "morning", unit: "15m", carers: 2 }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.unit), ["30m", "15m"]);
});

test("an empty package makes no plan at all", () => {
  assert.deepEqual(packageRows([]), []);
  assert.equal(callsPerWeek([]), 0);
  assert.equal(describePackage([]), "no calls");
});

test("the package is described in words for the audit trail", () => {
  assert.equal(
    describePackage([
      line({ days: EVERY_DAY, slot: "morning", unit: "45m", carers: 2 }),
      line({ service: "Shopping", days: [4], slot: "lunch", unit: "1hr" }),
    ]),
    "Care 45m, 2 carers, morning, every day; Shopping 1hr, 1 carer, lunch, Fri",
  );
});

/* --- editing a plan that already exists ------------------------------------------------ */

test("a stored week folds back into the lines that made it", () => {
  const rows = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    day_of_week: d, service: "Care", unit: "45m", slot: "morning", carers: 2, quantity: 1,
  }));
  rows.push({ day_of_week: 1, service: "Sit", unit: "2hr", slot: "afternoon", carers: 1, quantity: 1 });

  const lines = linesFromRows(rows);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].days, EVERY_DAY);
  assert.equal(lines[0].service, "Care");
  assert.deepEqual(lines[1].days, [1]);
  assert.equal(lines[1].service, "Sit");
});

test("calls that differ only in length, or only in carers, stay apart and keep their money", () => {
  const lines = linesFromRows([
    { day_of_week: 0, service: "Care", unit: "45m", slot: "morning", carers: 2, quantity: 1 },
    { day_of_week: 1, service: "Care", unit: "30m", slot: "morning", carers: 2, quantity: 1 },
    { day_of_week: 2, service: "Care", unit: "45m", slot: "morning", carers: 1, quantity: 1 },
  ]);
  assert.equal(lines.length, 3);
});

test("folding and expanding a plan gives the plan back", () => {
  /* The round trip is the whole safety of editing an existing plan in the builder. */
  const original = [
    { day_of_week: 0, service: "Care", unit: "45m", slot: "morning", carers: 2, quantity: 1 },
    { day_of_week: 1, service: "Care", unit: "45m", slot: "morning", carers: 2, quantity: 1 },
    { day_of_week: 1, service: "Sit", unit: "2hr", slot: "afternoon", carers: 1, quantity: 2 },
  ];
  const back = packageRows(linesFromRows(original)).map((r) => ({
    day_of_week: r.day_of_week, service: r.service, unit: r.unit,
    slot: r.slot as string, carers: r.carers, quantity: r.quantity,
  }));
  assert.deepEqual(
    [...back].sort((a, b) => a.day_of_week - b.day_of_week || a.service.localeCompare(b.service)),
    [...original].sort((a, b) => a.day_of_week - b.day_of_week || a.service.localeCompare(b.service)),
  );
});

test("a row with no slot lands somewhere real rather than vanishing", () => {
  const [only] = linesFromRows([
    { day_of_week: 0, service: "Care", unit: "30m", slot: null, carers: 1, quantity: 1 },
  ]);
  assert.equal(only.slot, "morning");
});

test("a quantity above one is carried, not rounded down to one and under billed", () => {
  const [only] = parsePackage(
    [{ service: "Care", days: [0], slot: "morning", unit: "30m", quantity: 2 }], opts,
  );
  assert.equal(only.quantity, 2);
  assert.equal(packageRows([only])[0].quantity, 2);
  assert.equal(callsPerWeek([only]), 2);
});

test("a missing or silly quantity is one call", () => {
  const read = (quantity: unknown) =>
    parsePackage([{ service: "Care", days: [0], slot: "morning", unit: "30m", quantity }], opts)[0].quantity;
  assert.equal(read(undefined), 1);
  assert.equal(read(0), 1);
  assert.equal(read(-3), 1);
  assert.equal(read("nonsense"), 1);
  assert.equal(read(9999), 24);
});
