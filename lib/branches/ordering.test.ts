import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED. */
import { orderBranches, chargeableCount, isOperational } from "./ordering.ts";

const row = (id: string, name: string, kind: string, created_at: string) => ({
  id,
  name,
  kind,
  created_at,
});

/** Thistle as it actually stands: office and Cardiff provisioned in the same instant,
 *  Newport opened five minutes later. */
const THISTLE = [
  row("office", "Thistle Care Ltd Office", "team", "2026-08-19T21:58:20.366Z"),
  row("cardiff", "Cardiff", "branch", "2026-08-19T21:58:20.366Z"),
  row("newport", "Newport", "branch", "2026-08-19T22:03:28.691Z"),
];

test("the office comes first, however the rows arrive", () => {
  const ordered = orderBranches(THISTLE, 1);
  assert.equal(ordered[0].id, "office");
  assert.equal(ordered[0].billing, "office");

  // Reversed input, same answer.
  const reversed = orderBranches([...THISTLE].reverse(), 1);
  assert.deepEqual(
    reversed.map((r) => r.id),
    ordered.map((r) => r.id),
  );
});

test("on Business the branch they have had longest is the included one", () => {
  const ordered = orderBranches(THISTLE, 1);
  assert.deepEqual(
    ordered.map((r) => [r.id, r.billing]),
    [
      ["office", "office"],
      ["cardiff", "included"],
      ["newport", "chargeable"],
    ],
  );
  assert.equal(chargeableCount(ordered), 1);
});

test("upgrading to Pro makes the second branch free without moving anything", () => {
  const business = orderBranches(THISTLE, 1);
  const pro = orderBranches(THISTLE, 2);

  // Same order, only the labels change: the customer must not see their branches shuffle
  // because they paid more.
  assert.deepEqual(business.map((r) => r.id), pro.map((r) => r.id));
  assert.deepEqual(
    pro.map((r) => r.billing),
    ["office", "included", "included"],
  );
  assert.equal(chargeableCount(pro), 0);
});

test("opening a new branch never reclassifies one they already had", () => {
  const before = orderBranches(THISTLE, 1);
  const after = orderBranches(
    [...THISTLE, row("swansea", "Swansea", "branch", "2026-09-01T09:00:00.000Z")],
    1,
  );

  // Everything that existed before keeps its label, and the new one is the chargeable one.
  for (const b of before) {
    const a = after.find((r) => r.id === b.id)!;
    assert.equal(a.billing, b.billing, `${b.id} changed label`);
  }
  assert.equal(after.at(-1)!.id, "swansea");
  assert.equal(after.at(-1)!.billing, "chargeable");
  assert.equal(chargeableCount(after), 2);
});

test("a branch opened out of order still sorts by when it was opened, not by name", () => {
  const rows = [
    row("office", "Office", "team", "2026-01-01T00:00:00.000Z"),
    row("b", "Aberdare", "branch", "2026-05-01T00:00:00.000Z"),
    row("a", "Zeta", "branch", "2026-02-01T00:00:00.000Z"),
  ];
  // Alphabetically Aberdare would win. It does not: Zeta was there first, so Zeta is included.
  assert.deepEqual(
    orderBranches(rows, 1).map((r) => [r.id, r.billing]),
    [
      ["office", "office"],
      ["a", "included"],
      ["b", "chargeable"],
    ],
  );
});

test("identical timestamps fall back to name, so the label cannot flicker", () => {
  const same = "2026-03-03T12:00:00.000Z";
  const rows = [
    row("z", "Zeta", "branch", same),
    row("a", "Alpha", "branch", same),
  ];
  const first = orderBranches(rows, 1);
  const second = orderBranches([...rows].reverse(), 1);
  assert.deepEqual(first.map((r) => r.id), ["a", "z"]);
  assert.deepEqual(second.map((r) => r.id), ["a", "z"]);
  assert.equal(first[0].billing, "included");
});

test("Black is effectively unlimited, so nothing is ever labelled chargeable", () => {
  const ordered = orderBranches(THISTLE, 9999);
  assert.equal(chargeableCount(ordered), 0);
});

test("a company with no branches at all is just its office", () => {
  const ordered = orderBranches([THISTLE[0]], 1);
  assert.deepEqual(ordered.map((r) => r.billing), ["office"]);
  assert.equal(chargeableCount(ordered), 0);
});

test("only kind branch is operational, which is what billing counts", () => {
  assert.equal(isOperational("branch"), true);
  assert.equal(isOperational("team"), false);
});

test("a nonsense included count is treated as none included, never as negative", () => {
  const ordered = orderBranches(THISTLE, -3);
  assert.deepEqual(
    ordered.map((r) => r.billing),
    ["office", "chargeable", "chargeable"],
  );
});

test("an unparseable timestamp does not throw or lose the row", () => {
  const rows = [
    row("office", "Office", "team", "not a date"),
    row("a", "Alpha", "branch", "also not a date"),
    row("b", "Beta", "branch", "2026-01-01T00:00:00.000Z"),
  ];
  const ordered = orderBranches(rows, 1);
  assert.equal(ordered.length, 3);
  assert.equal(ordered[0].id, "office");
});
