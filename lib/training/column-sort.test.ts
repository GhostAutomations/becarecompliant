import test from "node:test";
import assert from "node:assert/strict";
import { sortByCourse, sortByNumber, sortByDate, type SortableCell } from "./column-sort.ts";

type Row = { name: string; cell: SortableCell };
const rows: Row[] = [
  { name: "Amy", cell: { status: "valid", expiryOn: "2027-03-01" } },
  { name: "Ben", cell: null }, // course not for Ben
  { name: "Cat", cell: { status: "missing" } },
  { name: "Dan", cell: { status: "expired", expiryOn: "2026-01-10" } },
  { name: "Eve", cell: { status: "valid", expiryOn: null } }, // one off, done
  { name: "Fay", cell: { status: "due_soon", expiryOn: "2026-10-20" } },
  { name: "Gus", cell: { status: "valid", expiryOn: "2027-03-01" } }, // same date as Amy
];
const names = (r: Row[]) => r.map((x) => x.name).join(",");

test("soonest due first: never done, then oldest date, then undated, then not applicable", () => {
  assert.equal(names(sortByCourse(rows, (r) => r.cell, "soonest")), "Cat,Dan,Fay,Amy,Gus,Eve,Ben");
});

test("latest first reverses the order but keeps not applicable at the bottom", () => {
  assert.equal(names(sortByCourse(rows, (r) => r.cell, "latest")), "Eve,Amy,Gus,Fay,Dan,Cat,Ben");
});

test("ties keep the name order they arrived in, in both directions", () => {
  const s = names(sortByCourse(rows, (r) => r.cell, "soonest"));
  const l = names(sortByCourse(rows, (r) => r.cell, "latest"));
  assert.ok(s.indexOf("Amy") < s.indexOf("Gus"));
  assert.ok(l.indexOf("Amy") < l.indexOf("Gus"));
});

test("never mutates the list it was given", () => {
  const before = names(rows);
  sortByCourse(rows, (r) => r.cell, "soonest");
  assert.equal(names(rows), before);
});

test("an empty register sorts to an empty register", () => {
  assert.deepEqual(sortByCourse([], () => null, "soonest"), []);
});

test("phase bars: lowest first under soonest, no phase last either way", () => {
  const p = [{ n: "A", v: 50 }, { n: "B", v: null }, { n: "C", v: 0 }, { n: "D", v: 100 }];
  assert.equal(sortByNumber(p, (x) => x.v, "soonest").map((x) => x.n).join(","), "C,A,D,B");
  assert.equal(sortByNumber(p, (x) => x.v, "latest").map((x) => x.n).join(","), "D,A,C,B");
});

test("SCW column: no number (when required) first, then soonest renewal, not yet required last", () => {
  const s = [
    { n: "A", d: "2027-01-01", req: true },
    { n: "B", d: null, req: true },
    { n: "C", d: null, req: false },
    { n: "D", d: "2026-11-01", req: true },
  ];
  assert.equal(sortByDate(s, (x) => x.d, "soonest", (x) => x.req).map((x) => x.n).join(","), "B,D,A,C");
});
