import test from "node:test";
import assert from "node:assert/strict";
import { setupCell } from "./setup-cell.ts";

// Package starts 20 Oct 2026; setup due that day (0 days before start, amber 0).
const base = { packageStart: "2026-10-20", due: "2026-10-20", completedOn: null, amberDays: 0, paused: false };

test("not done, before the package start: green Due", () => {
  assert.deepEqual(setupCell({ ...base, today: "2026-10-19" }), { tone: "green", text: "Due 20 Oct 26", done: false });
  assert.equal(setupCell({ ...base, today: "2026-10-01" }).tone, "green");
});

test("not done, on the package start: amber Due", () => {
  assert.deepEqual(setupCell({ ...base, today: "2026-10-20" }), { tone: "amber", text: "Due 20 Oct 26", done: false });
});

test("not done, after the package start: red Late", () => {
  assert.deepEqual(setupCell({ ...base, today: "2026-10-21" }), { tone: "red", text: "Late", done: false });
});

test("done the day before, on the day, the day after: green, green, red", () => {
  const at = (completedOn: string) => setupCell({ ...base, completedOn, today: "2026-11-01" });
  assert.deepEqual(at("2026-10-19"), { tone: "green", text: "19 Oct 26", done: true });
  assert.deepEqual(at("2026-10-20"), { tone: "green", text: "20 Oct 26", done: true });
  assert.deepEqual(at("2026-10-21"), { tone: "red", text: "21 Oct 26", done: true });
});

test("package start at a month end and on 29 February 2028", () => {
  const monthEnd = { ...base, packageStart: "2026-10-31", due: "2026-10-31" };
  assert.equal(setupCell({ ...monthEnd, today: "2026-10-31" }).tone, "amber");
  assert.equal(setupCell({ ...monthEnd, today: "2026-11-01" }).text, "Late");
  assert.equal(setupCell({ ...monthEnd, today: "2026-10-30" }).tone, "green");
  const leap = { ...base, packageStart: "2028-02-29", due: "2028-02-29" };
  assert.equal(setupCell({ ...leap, today: "2028-02-28" }).tone, "green");
  assert.deepEqual(setupCell({ ...leap, today: "2028-02-29" }), { tone: "amber", text: "Due 29 Feb 28", done: false });
  assert.equal(setupCell({ ...leap, today: "2028-03-01" }).text, "Late");
  assert.equal(setupCell({ ...leap, completedOn: "2028-03-01", today: "2028-03-05" }).tone, "red");
});

test("across the clock change (25 October 2026) a day is still a day", () => {
  const s = { ...base, packageStart: "2026-10-26", due: "2026-10-26" };
  assert.equal(setupCell({ ...s, today: "2026-10-25" }).tone, "green");
  assert.equal(setupCell({ ...s, today: "2026-10-26" }).tone, "amber");
});

test("no package start: nothing shown", () => {
  assert.deepEqual(setupCell({ ...base, packageStart: null, due: null, today: "2026-10-20" }), { tone: "none", text: "", done: false });
});

test("paused service user: Paused, as now; a done one keeps its done date", () => {
  assert.deepEqual(setupCell({ ...base, paused: true, today: "2026-10-25" }), { tone: "paused", text: "Paused", done: false });
  assert.equal(setupCell({ ...base, paused: true, completedOn: "2026-10-20", today: "2026-10-25" }).tone, "green");
});

test("a company that sets its own amber days still gets the same rule otherwise", () => {
  assert.equal(setupCell({ ...base, amberDays: 3, today: "2026-10-17" }).tone, "amber");
  assert.equal(setupCell({ ...base, amberDays: 3, today: "2026-10-16" }).tone, "green");
});
