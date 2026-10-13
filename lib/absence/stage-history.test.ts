import test from "node:test";
import assert from "node:assert/strict";

import {
  absenceCardStatus,
  bookableStages,
  countsAtEachAbsence,
  openStagesLine,
  stageHistory,
  type HistoryEvent,
  type HistoryMeeting,
} from "./stage-history.ts";
import { windowStartIso } from "./discount.ts";

const SIX_MONTHS = { value: 6, unit: "month" as const };
const THISTLE = [
  { stage: 1, occasions: 3 },
  { stage: 2, occasions: 4 },
  { stage: 3, occasions: 5 },
  { stage: 4, occasions: 6 },
];

let n = 0;
const ev = (start: string, end: string | null = null, discounted = false): HistoryEvent => ({
  id: `e${++n}-${start}`,
  start_date: start,
  end_date: end,
  discounted_at: discounted ? "2026-10-13T10:00:00Z" : null,
});
const mt = (stage: number, date: string, held: boolean, declined = false): HistoryMeeting => ({
  id: `m${++n}`,
  stage,
  meeting_date: date,
  held,
  declined,
});

/** The ticket's pattern: 1 to 7 April (7 days), 9 April, 29 August, 1 October 2026. */
function ticketPattern() {
  return [ev("2026-04-01", "2026-04-07"), ev("2026-04-09", "2026-04-09"), ev("2026-08-29", "2026-08-29"), ev("2026-10-01", "2026-10-01")];
}

const run = (events: HistoryEvent[], meetings: HistoryMeeting[] = [], todayIso = "2026-10-13") =>
  stageHistory({ events, meetings, triggers: THISTLE, window: SIX_MONTHS, todayIso });

test("THE TICKET: Stage 1 reached 29 Aug and Stage 2 on 1 Oct, both Due with no meeting", () => {
  const h = run(ticketPattern());
  assert.deepEqual(
    h.current.map((r) => [r.stage, r.reachedOn, r.state]),
    [
      [1, "2026-08-29", "due"],
      [2, "2026-10-01", "due"],
    ],
  );
  assert.equal(openStagesLine(h), "Stage 1 Due · Stage 2 Due");
});

test("THE TICKET: Stage 1 booked, not held: Stage 1 Pending and Stage 2 Due", () => {
  const h = run(ticketPattern(), [mt(1, "2026-10-20", false)]);
  assert.deepEqual(h.current.map((r) => [r.stage, r.state, r.meetingDate]), [
    [1, "pending", "2026-10-20"],
    [2, "due", null],
  ]);
  assert.equal(openStagesLine(h), "Stage 1 Pending · Stage 2 Due");
});

test("THE TICKET: Stage 1 held: Stage 1 Dealt with, Stage 2 still Due", () => {
  const h = run(ticketPattern(), [mt(1, "2026-10-20", true)], "2026-10-21");
  assert.deepEqual(h.current.map((r) => [r.stage, r.state]), [
    [1, "dealt_with"],
    [2, "due"],
  ]);
  assert.equal(openStagesLine(h), "Stage 2 Due");
});

test("no absence of a Due or Pending stage is called Outside the window, however old", () => {
  const events = ticketPattern();
  const h = run(events, [mt(1, "2026-10-20", false)]);
  // On 13 Oct the window starts 13 Apr: the April absences are old, but they reached the stages.
  for (const e of events) assert.notEqual(absenceCardStatus(e.id, false, h).kind, "outside_window");
  assert.deepEqual(absenceCardStatus(events[2].id, false, h), { kind: "milestone", stages: [1] });
  assert.deepEqual(absenceCardStatus(events[3].id, false, h), { kind: "milestone", stages: [2] });
  assert.equal(absenceCardStatus(events[0].id, false, h).kind, "counts");
  assert.deepEqual([...h.bracketed].sort(), events.map((e) => e.id).sort());
});

test("an old absence that is part of no open stage is Outside the window", () => {
  const old = ev("2025-01-10");
  const h = run([old, ...ticketPattern()]);
  assert.equal(absenceCardStatus(old.id, false, h).kind, "outside_window");
});

test("a stage never expires: a year later it is still Due", () => {
  const h = run(ticketPattern(), [], "2027-10-13");
  assert.equal(openStagesLine(h), "Stage 1 Due · Stage 2 Due");
});

test("a higher stage meeting does not deal with a lower stage (Phil: No)", () => {
  const h = run(ticketPattern(), [mt(2, "2026-10-20", true)], "2026-10-21");
  assert.deepEqual(h.current.map((r) => [r.stage, r.state]), [
    [1, "due"],
    [2, "dealt_with"],
  ]);
});

test("a meeting held BEFORE the stage was reached does not deal with it", () => {
  const h = run(ticketPattern(), [mt(1, "2026-06-05", true)]);
  assert.equal(h.current[0].state, "due");
});

test("a meeting held on the day the stage was reached deals with it", () => {
  const h = run(ticketPattern(), [mt(1, "2026-08-29", true)]);
  assert.equal(h.current[0].state, "dealt_with");
});

test("a declined booking is not a booking: the stage stays Due", () => {
  const h = run(ticketPattern(), [mt(1, "2026-10-20", false, true)]);
  assert.equal(h.current[0].state, "due");
});

test("discounted absences never count", () => {
  const [a, b, c, d] = ticketPattern();
  const h = run([{ ...a, discounted_at: "2026-10-13" }, b, c, { ...d, discounted_at: "2026-10-13" }]);
  assert.deepEqual(h.current, []);
  assert.equal(absenceCardStatus(a.id, true, h).kind, "discounted");
});

test("booking defaults to the lowest Due stage and offers every Due stage", () => {
  assert.deepEqual(bookableStages(run(ticketPattern()), []), [1, 2]);
  assert.deepEqual(bookableStages(run(ticketPattern(), [mt(1, "2026-10-20", false)]), []), [2]);
});

test("with nothing Due, the next stage can still be booked early, never a booked one", () => {
  assert.deepEqual(bookableStages(run([ev("2026-10-01")]), []), [1]);
  assert.deepEqual(bookableStages(run([ev("2026-10-01")]), [1]), [2]);
  const pending = run(ticketPattern().slice(0, 3), [mt(1, "2026-10-20", false)]);
  assert.deepEqual(bookableStages(pending, []), [2]);
  const all = run(ticketPattern(), [mt(1, "2026-10-01", true), mt(2, "2026-10-02", true)]);
  assert.deepEqual(bookableStages(all, [1, 2, 3, 4]), []);
});

test("the count alone decides: a new absence after a meeting is not the next stage by itself", () => {
  // Two old absences, a Stage 1 meeting, then one absence after the old ones aged out.
  const h = run([ev("2025-01-05"), ev("2025-02-05"), ev("2026-09-25")], [mt(1, "2025-03-01", true)]);
  assert.deepEqual(h.current, []);
});

test("a stage is reached again only after the count falls below its trigger", () => {
  const first = [ev("2025-01-05"), ev("2025-02-05"), ev("2025-03-05")];
  const later = [ev("2026-01-05"), ev("2026-02-05"), ev("2026-03-05")];
  const h = run([...first, ...later], [mt(1, "2025-03-20", true)], "2026-03-10");
  assert.deepEqual(h.reached.map((r) => [r.stage, r.reachedOn, r.state]), [
    [1, "2025-03-05", "dealt_with"],
    [1, "2026-03-05", "due"],
  ]);
  assert.deepEqual(h.current.map((r) => [r.stage, r.reachedOn]), [[1, "2026-03-05"]]);
});

test("a Dealt with stage is not reached again while the count stays above its trigger", () => {
  const h = run(ticketPattern(), [mt(1, "2026-08-30", true)]);
  assert.equal(h.reached.filter((r) => r.stage === 1).length, 1);
});

test("an open stage is not reached a second time when the count dips and climbs back", () => {
  const h = run([ev("2025-01-05"), ev("2025-02-05"), ev("2025-03-05"), ev("2025-12-01"), ev("2026-01-01"), ev("2026-02-01")]);
  assert.deepEqual(h.reached.map((r) => [r.stage, r.reachedOn]), [[1, "2025-03-05"]]);
});

test("a multi day absence starting before the window and ending inside it counts", () => {
  // At 1 Oct the window starts 1 Apr: 25 Mar to 2 Apr ends inside it.
  const events = [ev("2026-03-25", "2026-04-02"), ev("2026-06-01"), ev("2026-10-01")];
  assert.equal(run(events).current[0]?.reachedOn, "2026-10-01");
});

test("an absence starting exactly on the window's first day counts; the day before does not", () => {
  assert.equal(run([ev("2026-04-01"), ev("2026-06-01"), ev("2026-10-01")]).current[0]?.reachedOn, "2026-10-01");
  assert.deepEqual(run([ev("2026-03-31"), ev("2026-06-01"), ev("2026-10-01")]).current, []);
});

test("month ends: 31 Aug less 6 months is 28 Feb (29 Feb in a leap year)", () => {
  assert.equal(windowStartIso("2026-08-31", SIX_MONTHS), "2026-02-28");
  assert.equal(windowStartIso("2028-08-31", SIX_MONTHS), "2028-02-29");
  assert.equal(run([ev("2026-02-28"), ev("2026-05-01"), ev("2026-08-31")]).current[0]?.reachedOn, "2026-08-31");
  assert.deepEqual(run([ev("2026-02-27"), ev("2026-05-01"), ev("2026-08-31")]).current, []);
});

test("leap year: an absence on 29 Feb 2028 counts six months later on 29 Aug and 31 Aug", () => {
  assert.equal(windowStartIso("2028-08-29", SIX_MONTHS), "2028-02-29");
  const h = run([ev("2028-02-29"), ev("2028-05-01"), ev("2028-08-31")], [], "2028-09-01");
  assert.equal(h.current[0]?.reachedOn, "2028-08-31");
});

test("the clock change (25 Oct 2026) moves no day", () => {
  assert.equal(windowStartIso("2026-10-25", SIX_MONTHS), "2026-04-25");
  assert.equal(windowStartIso("2026-10-26", SIX_MONTHS), "2026-04-26");
  const h = run([ev("2026-04-25"), ev("2026-07-01"), ev("2026-10-25")], [], "2026-10-26");
  assert.equal(h.current[0]?.reachedOn, "2026-10-25");
});

test("weeks and days windows work the same way", () => {
  const weeks = stageHistory({
    events: [ev("2026-01-01"), ev("2026-01-08"), ev("2026-01-15")],
    meetings: [],
    triggers: THISTLE,
    window: { value: 2, unit: "week" },
    todayIso: "2026-01-20",
  });
  assert.equal(weeks.current[0]?.reachedOn, "2026-01-15");
});

test("the count at each absence, oldest first, with ties in a fixed order", () => {
  const steps = countsAtEachAbsence(ticketPattern(), SIX_MONTHS);
  assert.deepEqual(steps.map((s) => s.inWindow.length), [1, 2, 3, 4]);
});

test("no triggers set, no stages", () => {
  const h = stageHistory({ events: ticketPattern(), meetings: [], triggers: [], window: SIX_MONTHS, todayIso: "2026-10-13" });
  assert.deepEqual(h.current, []);
  assert.equal(openStagesLine(h), "");
});
