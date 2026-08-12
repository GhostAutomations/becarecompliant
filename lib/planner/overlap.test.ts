import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. overlap.ts has no runtime imports for exactly this reason. */
import {
  bookingsOverlap,
  bookingWindow,
  clashMessage,
  minutesFromMidnight,
  displayTime,
} from "./overlap.ts";

const at = (startTime: unknown, durationMinutes: unknown = 30) => ({ startTime, durationMinutes });

test("THE CASE THAT STARTED THIS: three 10:00 bookings all collide", () => {
  // Akram's Planner, 13 August 2026: Audit, Audit and Manual Handling, all 10:00 for 30.
  assert.equal(bookingsOverlap(at("10:00:00"), at("10:00:00")), true);
});

test("back to back is NOT a clash", () => {
  // 10:00+30 ends exactly as 10:30 begins. Refusing this would refuse an ordinary morning.
  assert.equal(bookingsOverlap(at("10:00"), at("10:30")), false);
  assert.equal(bookingsOverlap(at("10:30"), at("10:00")), false);
});

test("a partial overlap in either direction is a clash", () => {
  assert.equal(bookingsOverlap(at("10:00"), at("10:15")), true);
  assert.equal(bookingsOverlap(at("10:15"), at("10:00")), true);
});

test("a long booking blocks everything inside it", () => {
  // 90 minute audit at 10:00 against a supervision at 10:30 and another at 11:15.
  assert.equal(bookingsOverlap(at("10:00", 90), at("10:30")), true);
  assert.equal(bookingsOverlap(at("10:00", 90), at("11:15")), true);
  assert.equal(bookingsOverlap(at("10:00", 90), at("11:30")), false);
});

test("an untimed booking never clashes with anything", () => {
  // Matches the database, where the constraints are `where start_time is not null`.
  assert.equal(bookingsOverlap(at(null), at("10:00")), false);
  assert.equal(bookingsOverlap(at("10:00"), at(null)), false);
  assert.equal(bookingsOverlap(at(""), at("")), false);
  assert.equal(bookingsOverlap(at(undefined), at("10:00")), false);
});

test("a missing or nonsense duration means no window, never a zero length one", () => {
  assert.equal(bookingWindow("10:00", null), null);
  assert.equal(bookingWindow("10:00", 0), null);
  assert.equal(bookingWindow("10:00", -30), null);
  assert.equal(bookingWindow("10:00", "30"), null);
  assert.deepEqual(bookingWindow("10:00", 30), { start: 600, end: 630 });
});

test("a nonsense time is no window rather than midnight", () => {
  // The dangerous failure: treating rubbish as 00:00 would make everything clash at midnight.
  assert.equal(minutesFromMidnight("not a time"), null);
  assert.equal(minutesFromMidnight("25:00"), null);
  assert.equal(minutesFromMidnight("10:75"), null);
  assert.equal(minutesFromMidnight(600), null);
  assert.equal(minutesFromMidnight("10:00:00"), 600);
  assert.equal(minutesFromMidnight("9:30"), 570);
});

test("midnight itself is a real time, not a missing one", () => {
  assert.equal(minutesFromMidnight("00:00"), 0);
  assert.deepEqual(bookingWindow("00:00", 30), { start: 0, end: 30 });
});

test("displayTime trims the seconds Postgres returns", () => {
  assert.equal(displayTime("10:00:00"), "10:00");
  assert.equal(displayTime("9:05"), "09:05");
  assert.equal(displayTime(null), "");
});

test("the refusal names who is busy, when, and what is in the way", () => {
  assert.equal(
    clashMessage({ name: "Akram Abappa", what: "Audit", when: "10:00", bookedByAnother: false }),
    "Akram Abappa is already booked at 10:00 that day (Audit).",
  );
});

test("a clash made by somebody else says so, because it is invisible on your own Planner", () => {
  assert.equal(
    clashMessage({ name: "AA AA", what: "Audit", when: "10:00", bookedByAnother: true }),
    "Somebody else has already booked AA AA at 10:00 that day (Audit).",
  );
});

test("EVERY check kind reads correctly, which is why the name is in brackets", () => {
  // The first live version said "already has Audit booked". The obvious fix, an a/an rule on
  // the first letter, gives "a Manual Handling" and "a Mentoring". Brackets dodge it.
  for (const kind of [
    "Audit",
    "Manual Handling",
    "Medication Competency",
    "Mentoring",
    "Spot Check",
    "Supervision",
    "Care Plan Review",
  ]) {
    const line = clashMessage({ name: "Tim Mingle", what: kind, when: "09:15", bookedByAnother: false });
    assert.equal(line, `Tim Mingle is already booked at 09:15 that day (${kind}).`);
    assert.doesNotMatch(line, / an? [A-Z]/);
  }
});

test("a booking with no check kind still produces a sentence", () => {
  assert.equal(
    clashMessage({ name: "", what: "  ", when: "", bookedByAnother: false }),
    "That person is already booked that day (another task).",
  );
});
