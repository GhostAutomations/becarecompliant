import { test } from "node:test";
import assert from "node:assert/strict";
import { absenceRank, rankAbsenceRows } from "./rank.ts";

const base = { derivedStage: null, derivedLabel: null, meetingDue: false, bradfordScore: 0, booking: null };

test("a due meeting with nothing booked comes first", () => {
  assert.equal(absenceRank({ ...base, derivedStage: 1, derivedLabel: "Stage 1", meetingDue: true }), 0);
});

test("a declined invitation still needs booking", () => {
  assert.equal(
    absenceRank({ ...base, derivedStage: 1, derivedLabel: "Stage 1", meetingDue: true, booking: { response: "declined" } }),
    0,
  );
});

test("a booked meeting comes next", () => {
  assert.equal(absenceRank({ ...base, derivedStage: 1, derivedLabel: "Stage 1", meetingDue: true, booking: {} }), 1);
});

test("a stage already met sits below that, below threshold last", () => {
  assert.equal(absenceRank({ ...base, derivedStage: 1, derivedLabel: "Stage 1" }), 2);
  assert.equal(absenceRank(base), 3);
});

test("group first, then higher stage, then the incoming (surname) order", () => {
  const rows = [
    { n: "a", ...base },
    { n: "b", ...base, derivedStage: 1, derivedLabel: "Stage 1" },
    { n: "c", ...base, derivedStage: 1, derivedLabel: "Stage 1", meetingDue: true },
    { n: "d", ...base, derivedStage: 2, derivedLabel: "Stage 2", meetingDue: true },
    { n: "e", ...base },
    { n: "f", ...base, derivedStage: 1, derivedLabel: "Stage 1", meetingDue: true, booking: {} },
  ];
  assert.deepEqual(rankAbsenceRows(rows, (r) => r).map((r) => r.n), ["d", "c", "f", "b", "a", "e"]);
});
