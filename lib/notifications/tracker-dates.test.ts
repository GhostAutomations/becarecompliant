import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysIso, datesToChase, trackerDateAlerts } from "./tracker-dates.ts";

const row = (personId: string, date: string) => ({ personId, branchId: "b1", date });
const person = (id: string, over: Partial<{ employmentStatus: string | null; archivedAt: string | null }> = {}) => ({
  id,
  fullName: `Person ${id}`,
  employmentStatus: over.employmentStatus ?? "active",
  archivedAt: over.archivedAt ?? null,
});

test("ninety days on crosses the month and year", () => {
  assert.equal(addDaysIso("2026-09-24", 90), "2026-12-23");
  assert.equal(addDaysIso("2026-12-01", 90), "2027-03-01");
  assert.equal(addDaysIso("2027-12-01", 90), "2028-02-29");
});

test("a Right to Work expiring in 36 days is chased at 90, not at 14 (Thistle, 30/10/2026)", () => {
  const rows = [row("a", "2026-10-30")];
  assert.equal(datesToChase(rows, "2026-09-24", 90).length, 1);
  assert.equal(datesToChase(rows, "2026-09-24", 14).length, 0);
});

test("the last day of the window is in, the day after is out", () => {
  const rows = [row("a", "2026-12-23"), row("b", "2026-12-24")];
  assert.deepEqual(datesToChase(rows, "2026-09-24", 90).map((r) => r.personId), ["a"]);
});

test("a date already past is always chased", () => {
  assert.equal(datesToChase([row("a", "2025-01-01")], "2026-09-24", 90).length, 1);
});

test("a malformed date is never chased", () => {
  assert.equal(datesToChase([row("a", "30/10/2026")], "2026-09-24", 90).length, 0);
});

test("leavers, archived records and unknown people are dropped", () => {
  const rows = [row("a", "2026-10-01"), row("b", "2026-10-01"), row("c", "2026-10-01"), row("d", "2026-10-01")];
  const people = [person("a"), person("b", { employmentStatus: "leaver" }), person("c", { archivedAt: "2026-01-01" })];
  assert.deepEqual(trackerDateAlerts(rows, people).map((a) => a.personId), ["a"]);
});

test("soonest first, then by name", () => {
  const rows = [row("b", "2026-11-01"), row("c", "2026-10-01"), row("a", "2026-11-01")];
  const out = trackerDateAlerts(rows, [person("a"), person("b"), person("c")]);
  assert.deepEqual(out.map((a) => a.personId), ["c", "a", "b"]);
});
