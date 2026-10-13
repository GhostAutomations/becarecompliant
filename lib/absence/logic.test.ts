import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveAbsenceStatus,
  offeredStages,
  resolveAbsenceStatus,
  type AbsenceAggregate,
  type AbsenceConfig,
} from "./logic.ts";
import { availableStages } from "./record-meeting.ts";

const CONFIG: AbsenceConfig = {
  method: "stages",
  window: { value: 6, unit: "month" },
  thresholds: [
    { stage: 1, label: "Stage 1", occasions: 3 },
    { stage: 2, label: "Stage 2", occasions: 4 },
    { stage: 3, label: "Stage 3", occasions: 5 },
    { stage: 4, label: "Stage 4", occasions: 6 },
  ],
};

/** What the old count says about the ticket's pattern on 13 Oct: the April absences have aged out. */
const AGG: AbsenceAggregate = {
  occasions: 2,
  totalDays: 2,
  latestMeetingStage: 1,
  absencesSinceMeeting: 0,
  heldMeetingStage: null,
  lastHeldStage: null,
  countedAtMeeting: 0,
  discountedAtMeeting: 0,
  heldMeetingWarning: null,
  heldStageAfterSet: false,
};

const EVENTS = [
  { id: "a", start_date: "2026-04-01", end_date: "2026-04-07", discounted_at: null },
  { id: "b", start_date: "2026-04-09", end_date: "2026-04-09", discounted_at: null },
  { id: "c", start_date: "2026-08-29", end_date: "2026-08-29", discounted_at: null },
  { id: "d", start_date: "2026-10-01", end_date: "2026-10-01", discounted_at: null },
];

test("NO INPUTS: exactly the old count, whatever the aggregate", () => {
  const cases: AbsenceAggregate[] = [
    AGG,
    { ...AGG, occasions: 0, latestMeetingStage: null },
    { ...AGG, occasions: 5, latestMeetingStage: 1, absencesSinceMeeting: 2, heldMeetingStage: 1, lastHeldStage: 1 },
    { ...AGG, occasions: 1, heldMeetingStage: 1, countedAtMeeting: 1, discountedAtMeeting: 2, heldMeetingWarning: "None" },
  ];
  for (const agg of cases) {
    const off = resolveAbsenceStatus(agg, CONFIG, null);
    assert.deepEqual(off, deriveAbsenceStatus(agg, CONFIG));
    assert.equal(off.history, undefined);
    assert.equal(off.offered, undefined);
    assert.deepEqual(offeredStages(off), availableStages(off.meetingStage, off.derivedStage));
  }
});

test("BRADFORD: a Bradford company keeps the old count even with the inputs", () => {
  const bradford: AbsenceConfig = { ...CONFIG, method: "bradford", thresholds: [{ threshold: 51, label: "Stage 1", action: "Talk" }] };
  const inputs = { events: EVENTS, meetings: [], todayIso: "2026-10-13" };
  assert.deepEqual(resolveAbsenceStatus(AGG, bradford, inputs), deriveAbsenceStatus(AGG, bradford));
});

test("STAGE HISTORY, the ticket: Stage 1 booked (Pending), Stage 2 Due, in Action required", () => {
  const on = resolveAbsenceStatus(AGG, CONFIG, {
    events: EVENTS,
    meetings: [{ id: "m1", stage: 1, meeting_date: "2026-10-20", held: false }],
    todayIso: "2026-10-13",
  });
  assert.deepEqual(on.history?.open.map((r) => [r.stage, r.state]), [
    [1, "pending"],
    [2, "due"],
  ]);
  assert.equal(on.meetingDue, true);
  assert.deepEqual(on.triggeredStages, [2]);
  assert.equal(on.derivedStage, 2);
  assert.deepEqual(on.offered, [2]);
  assert.deepEqual(offeredStages(on), [2]);
  // The counts on the card are still the old ones (today's window).
  assert.equal(on.occasions, 2);
});

test("STAGE HISTORY, the ticket: Stage 1 held, Stage 2 still Due", () => {
  const on = resolveAbsenceStatus(AGG, CONFIG, {
    events: EVENTS,
    meetings: [{ id: "m1", stage: 1, meeting_date: "2026-10-20", held: true }],
    todayIso: "2026-10-21",
  });
  assert.deepEqual(on.history?.current.map((r) => [r.stage, r.state]), [
    [1, "dealt_with"],
    [2, "due"],
  ]);
  assert.equal(on.lastHeldStage, 1);
  assert.deepEqual(on.offered, [2]);
});

test("STAGE HISTORY, no meetings: Stage 1 and Stage 2 Due, booking starts at Stage 1", () => {
  const on = resolveAbsenceStatus(AGG, CONFIG, { events: EVENTS, meetings: [], todayIso: "2026-10-13" });
  assert.deepEqual(on.triggeredStages, [1, 2]);
  assert.deepEqual(on.offered, [1, 2]);
});
