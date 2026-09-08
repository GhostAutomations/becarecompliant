import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingIsLate, type LateBooking } from "./late.ts";

const TODAY = "2026-09-08";
const at = (h: number, m = 0) => h * 60 + m;

const planned: LateBooking = {
  status: "planned",
  scheduledDate: TODAY,
  startTime: "12:30",
  durationMinutes: 30,
};

test("a slot that has finished is late", () => {
  assert.equal(bookingIsLate(planned, TODAY, at(13, 1)), true);
});

test("a slot still running is not late", () => {
  assert.equal(bookingIsLate(planned, TODAY, at(12, 45)), false);
});

test("the moment the slot ends is not yet late", () => {
  assert.equal(bookingIsLate(planned, TODAY, at(13, 0)), false);
});

test("a slot yet to start is not late", () => {
  assert.equal(bookingIsLate(planned, TODAY, at(9, 0)), false);
});

test("a completed task is never late, however long ago it was", () => {
  assert.equal(
    bookingIsLate({ ...planned, status: "completed", scheduledDate: "2026-01-01" }, TODAY, at(23, 59)),
    false,
  );
});

test("a cancelled task is never late", () => {
  assert.equal(
    bookingIsLate({ ...planned, status: "cancelled", scheduledDate: "2026-01-01" }, TODAY, at(23, 59)),
    false,
  );
});

test("any planned task on an earlier day is late, whatever the clock says", () => {
  assert.equal(bookingIsLate({ ...planned, scheduledDate: "2026-09-07" }, TODAY, null), true);
  assert.equal(bookingIsLate({ ...planned, scheduledDate: "2026-09-07" }, TODAY, at(0, 1)), true);
});

test("a task on a later day is never late", () => {
  assert.equal(bookingIsLate({ ...planned, scheduledDate: "2026-09-09" }, TODAY, at(23, 59)), false);
});

test("a task with no time has all day to happen in", () => {
  assert.equal(bookingIsLate({ ...planned, startTime: null }, TODAY, at(23, 59)), false);
  /* But it IS late once the day is over. */
  assert.equal(
    bookingIsLate({ ...planned, startTime: null, scheduledDate: "2026-09-07" }, TODAY, at(9, 0)),
    true,
  );
});

test("before the clock is read, nothing today is late", () => {
  /* The first paint must match the server, which has no time of day. */
  assert.equal(bookingIsLate(planned, TODAY, null), false);
});

test("a task with no duration is late the minute after it starts", () => {
  assert.equal(bookingIsLate({ ...planned, durationMinutes: null }, TODAY, at(12, 31)), true);
  assert.equal(bookingIsLate({ ...planned, durationMinutes: null }, TODAY, at(12, 30)), false);
});

test("a malformed time is not treated as late", () => {
  assert.equal(bookingIsLate({ ...planned, startTime: "half twelve" }, TODAY, at(23, 59)), false);
  assert.equal(bookingIsLate({ ...planned, startTime: "99:99" }, TODAY, at(23, 59)), false);
});
