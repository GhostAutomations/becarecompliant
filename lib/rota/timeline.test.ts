import { test } from "node:test";
import assert from "node:assert/strict";
import { clockInWords, dragStart, fromMinutes, lanes, snap, toMinutes, visitTone, weekDates } from "./timeline.ts";

test("minutes and back", () => {
  assert.equal(toMinutes("08:30"), 510);
  assert.equal(toMinutes("23:59:00"), 1439);
  assert.equal(fromMinutes(510), "08:30");
  assert.equal(fromMinutes(0), "00:00");
});

test("dragging snaps to 5 minutes and keeps the visit on its own day", () => {
  assert.equal(snap(62), 60);
  assert.equal(snap(63), 65);
  assert.equal(dragStart(720, 33, 30), 755); // 12:00 dragged 33 minutes: 12:35
  assert.equal(dragStart(720, -800, 30), 0); // never before midnight
  assert.equal(dragStart(1380, 120, 30), 1410); // never past the end of the day (23:30 to 00:00)
});

test("overlapping blocks go into lanes; touching ones share a lane", () => {
  const { lane, count } = lanes([
    { id: "a", start: 600, end: 630 },
    { id: "b", start: 615, end: 645 },
    { id: "c", start: 630, end: 660 },
  ]);
  assert.equal(count, 2);
  assert.equal(lane.get("a"), 0);
  assert.equal(lane.get("b"), 1);
  assert.equal(lane.get("c"), 0);
  assert.equal(lanes([]).count, 1);
});

test("how a visit looks: done, in progress, late after 15 minutes, due, draft, paused", () => {
  const start = Date.parse("2026-10-16T11:00:00Z");
  const base = { status: "published", paused: false, startsAtMs: start, nowMs: start, clockedIn: false, clockedOut: false };
  assert.equal(visitTone(base), "due");
  assert.equal(visitTone({ ...base, nowMs: start + 15 * 60_000 }), "due");
  assert.equal(visitTone({ ...base, nowMs: start + 16 * 60_000 }), "late");
  assert.equal(visitTone({ ...base, clockedIn: true, nowMs: start + 60 * 60_000 }), "in_progress");
  assert.equal(visitTone({ ...base, clockedIn: true, clockedOut: true }), "done");
  assert.equal(visitTone({ ...base, status: "draft" }), "draft");
  assert.equal(visitTone({ ...base, paused: true, nowMs: start + 60 * 60_000 }), "paused");
});

test("clock in against the start, in words", () => {
  const start = Date.parse("2026-10-16T11:00:00Z");
  assert.equal(clockInWords(start, start + 12 * 60_000), "12 min late");
  assert.equal(clockInWords(start, start - 5 * 60_000), "5 min early");
  assert.equal(clockInWords(start, start + 20_000), "on time");
  assert.equal(clockInWords(start, null), null);
});

test("the week a date falls in starts on Monday, across a month end and the clock change", () => {
  assert.deepEqual(weekDates("2026-10-16"), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.deepEqual(weekDates("2026-10-25").slice(0, 2), ["2026-10-19", "2026-10-20"]); // clocks go back on Sunday 25 Oct
  assert.deepEqual(weekDates("2026-11-01")[0], "2026-10-26");
});
