import test from "node:test";
import assert from "node:assert/strict";
import { affectedBy, blackoutClash, blackoutDates, blackoutMessage, blackoutsOn, upcomingFor, type Blackout } from "./blackouts.ts";

const SWANSEA = "b-swansea";
const NEATH = "b-neath";
const xmas: Blackout = { id: "x", start: "2026-12-20", end: "2027-01-02", reason: "Christmas cover", allBranches: false, branchIds: [SWANSEA] };
const inspection: Blackout = { id: "i", start: "2026-11-11", end: "2026-11-11", reason: "Inspection day", allBranches: true, branchIds: [] };
const monthEnd: Blackout = { id: "m", start: "2026-11-30", end: "2026-12-01", reason: "Month end returns", allBranches: false, branchIds: [NEATH] };
const all = [xmas, inspection, monthEnd];

test("the words match the database exactly", () => {
  assert.equal(blackoutMessage(xmas), "Holidays can't be booked 20 Dec to 2 Jan 2027: Christmas cover.");
  assert.equal(blackoutMessage(inspection), "Holidays can't be booked on 11 Nov 2026: Inspection day.");
  assert.equal(blackoutMessage(monthEnd), "Holidays can't be booked 30 Nov to 1 Dec 2026: Month end returns.");
  assert.equal(blackoutDates("2028-02-29", "2028-02-29"), "29 Feb 2028");
});

test("fully inside, one day overlapping, the day after", () => {
  assert.equal(blackoutClash(all, SWANSEA, "2026-12-24", "2026-12-27")?.id, "x");
  assert.equal(blackoutClash(all, SWANSEA, "2027-01-02", "2027-01-06")?.id, "x");
  assert.equal(blackoutClash(all, SWANSEA, "2026-12-15", "2026-12-20")?.id, "x");
  assert.equal(blackoutClash(all, SWANSEA, "2027-01-03", "2027-01-06"), null);
});

test("another branch can book the same dates; All branches covers everyone, even no branch", () => {
  assert.equal(blackoutClash(all, NEATH, "2026-12-24", "2026-12-27"), null);
  assert.equal(blackoutClash(all, NEATH, "2026-11-28", "2026-11-30")?.id, "m");
  assert.equal(blackoutClash(all, NEATH, "2026-11-11", "2026-11-11")?.id, "i");
  assert.equal(blackoutClash(all, null, "2026-11-10", "2026-11-12")?.id, "i");
  assert.equal(blackoutClash(all, null, "2026-12-24", "2026-12-27"), null);
});

test("calendar: across the month end and 31 Dec into January, by branch", () => {
  assert.deepEqual(blackoutsOn(all, "2026-12-31", SWANSEA).map((b) => b.id), ["x"]);
  assert.deepEqual(blackoutsOn(all, "2027-01-01", SWANSEA).map((b) => b.id), ["x"]);
  assert.deepEqual(blackoutsOn(all, "2026-12-01", NEATH).map((b) => b.id), ["m"]);
  assert.deepEqual(blackoutsOn(all, "2026-12-01", SWANSEA), []);
  assert.deepEqual(blackoutsOn(all, "2026-12-01", null).map((b) => b.id), ["m"]);
});

test("the staff list: only upcoming, only theirs, soonest first", () => {
  assert.deepEqual(upcomingFor(all, SWANSEA, "2026-10-15").map((b) => b.id), ["i", "x"]);
  assert.deepEqual(upcomingFor(all, SWANSEA, "2026-11-12").map((b) => b.id), ["x"]);
  assert.deepEqual(upcomingFor(all, NEATH, "2027-01-01"), []);
});

test("who already has holiday in a new blackout: approved and pending, in its branches", () => {
  const hols = [
    { id: "1", name: "A", branchId: SWANSEA, start: "2026-12-22", end: "2026-12-23", status: "approved" },
    { id: "2", name: "B", branchId: SWANSEA, start: "2026-12-28", end: "2026-12-29", status: "pending" },
    { id: "3", name: "C", branchId: SWANSEA, start: "2026-12-24", end: "2026-12-24", status: "cancelled" },
    { id: "4", name: "D", branchId: NEATH, start: "2026-12-24", end: "2026-12-24", status: "approved" },
    { id: "5", name: "E", branchId: SWANSEA, start: "2027-01-03", end: "2027-01-04", status: "approved" },
  ];
  assert.deepEqual(affectedBy({ start: "2026-12-20", end: "2027-01-02", allBranches: false, branchIds: [SWANSEA] }, hols).map((h) => h.id), ["1", "2"]);
  assert.deepEqual(affectedBy({ start: "2026-12-20", end: "2027-01-02", allBranches: true, branchIds: [] }, hols).map((h) => h.id), ["1", "4", "2"].sort((a, b) => hols.find((h) => h.id === a)!.start.localeCompare(hols.find((h) => h.id === b)!.start)));
  assert.deepEqual(affectedBy({ start: "2027-01-02", end: "2026-12-20", allBranches: true, branchIds: [] }, hols), []);
});
