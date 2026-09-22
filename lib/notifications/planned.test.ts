import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedFor, plannedIndex, plannedKey, type PlannedSource } from "./planned.ts";

const SPOT: PlannedSource = {
  recordId: "p1",
  checkName: "Spot Check",
  conductorName: "Hayley Davies",
  scheduledDate: "2026-09-24",
};

test("a booking is found for the row it belongs to", () => {
  const ix = plannedIndex([SPOT]);
  assert.deepEqual(plannedFor(ix, "p1", "Spot Check"), {
    conductorName: "Hayley Davies",
    scheduledDate: "2026-09-24",
  });
});

test("the two sides do not have to spell it identically", () => {
  const ix = plannedIndex([SPOT]);
  assert.ok(plannedFor(ix, "p1", "  spot   check "));
  assert.ok(plannedFor(ix, "p1", "SPOT CHECK"));
});

test("a different person's booking is not this person's", () => {
  const ix = plannedIndex([SPOT]);
  assert.equal(plannedFor(ix, "p2", "Spot Check"), null);
});

test("a different check on the same person is not this check", () => {
  const ix = plannedIndex([SPOT]);
  assert.equal(plannedFor(ix, "p1", "Supervision"), null);
});

test("booked twice: the earliest wins, because that is the one that answers the deadline", () => {
  const ix = plannedIndex([
    { ...SPOT, scheduledDate: "2026-11-02", conductorName: "Lauren" },
    { ...SPOT, scheduledDate: "2026-09-24", conductorName: "Hayley Davies" },
    { ...SPOT, scheduledDate: "2026-10-10", conductorName: "Gabbie" },
  ]);
  assert.deepEqual(plannedFor(ix, "p1", "Spot Check"), {
    conductorName: "Hayley Davies",
    scheduledDate: "2026-09-24",
  });
});

test("a booking whose conductor has left still counts as planned", () => {
  const ix = plannedIndex([{ ...SPOT, conductorName: null }]);
  assert.deepEqual(plannedFor(ix, "p1", "Spot Check"), {
    conductorName: null,
    scheduledDate: "2026-09-24",
  });
});

test("rows missing what they need are dropped, not half indexed", () => {
  const ix = plannedIndex([
    { ...SPOT, recordId: "" },
    { ...SPOT, checkName: "  " },
    { ...SPOT, scheduledDate: "" },
  ]);
  assert.equal(ix.size, 0);
});

test("the key is stable whichever way the name arrives", () => {
  assert.equal(plannedKey("p1", "Care Plan Review"), plannedKey("p1", "  care  plan review  "));
});
