import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingState,
  bookingCaption,
  bookingNote,
  bookingNoteFor,
  shortDate,
  longDate,
  trainingWritePlan,
} from "./booking.ts";
import { trainingStatus } from "./renewal.ts";

/**
 * A booking is a promise about the future. The thing these tests are really protecting is that
 * the promise never gets mistaken for the fact: a carer booked onto Fire Safety has not done
 * Fire Safety, and an inspector will ask about the second, not the first.
 */

test("a booking today or later is booked; yesterday's is missed", () => {
  assert.equal(bookingState("2026-09-03", "2026-08-14"), "booked");
  assert.equal(bookingState("2026-08-15", "2026-08-14"), "booked");
  assert.equal(bookingState("2026-08-13", "2026-08-14"), "missed");
  assert.equal(bookingState("2025-12-01", "2026-08-14"), "missed");
});

test("the day of the training is still BOOKED, not missed", () => {
  // The session runs at some hour we do not know and gets written up the next morning. Flipping
  // to "missed" at one minute past midnight tells a manager her team missed a session they are
  // sitting in.
  assert.equal(bookingState("2026-08-14", "2026-08-14"), "booked");
  assert.equal(bookingCaption("2026-08-14", "2026-08-14"), "Booked 14 Aug");
});

test("no booking, or rubbish, is none rather than a guess", () => {
  assert.equal(bookingState(null, "2026-08-14"), "none");
  assert.equal(bookingState(undefined, "2026-08-14"), "none");
  assert.equal(bookingState("", "2026-08-14"), "none");
  assert.equal(bookingState("next Tuesday", "2026-08-14"), "none");
  assert.equal(bookingState("2026-9-3", "2026-08-14"), "none");
  // A broken today must not turn every booking into a missed one.
  assert.equal(bookingState("2026-09-03", ""), "none");
});

test("A BOOKED COURSE IS STILL NOT COMPLIANT", () => {
  /*
   * The decision this whole module exists to keep (Phil, 2026-08-14). trainingStatus takes no
   * booking argument, and this test is here so that nobody ever gives it one: the day a booking
   * can reach it is the day a company can look compliant by booking training it never did.
   */
  const notDone = {
    recorded: false,
    expiryOn: null,
    amberDays: 30,
    oneOff: false,
    todayIso: "2026-08-14",
  };
  assert.equal(trainingStatus(notDone), "missing");
  assert.equal(bookingState("2026-09-03", "2026-08-14"), "booked");
  // Booked, and still missing. Both true at once, which is the point.
  assert.equal(trainingStatus(notDone), "missing");

  const expired = {
    recorded: true,
    expiryOn: "2026-07-01",
    amberDays: 30,
    oneOff: false,
    todayIso: "2026-08-14",
  };
  assert.equal(trainingStatus(expired), "expired");
  assert.equal(bookingState("2026-09-03", "2026-08-14"), "booked");
  assert.equal(trainingStatus(expired), "expired");
});

test("an in date course can be booked for its renewal: two facts, not one", () => {
  // Valid until December, booked for November. Neither cancels the other.
  const valid = {
    recorded: true,
    expiryOn: "2026-12-01",
    amberDays: 30,
    oneOff: false,
    todayIso: "2026-08-14",
  };
  assert.equal(trainingStatus(valid), "valid");
  assert.equal(bookingState("2026-11-15", "2026-08-14"), "booked");
});

test("the matrix captions a live booking and says nothing about a missed one", () => {
  // Phil, 2026-08-14: after the date the cell "goes back to plain overdue".
  assert.equal(bookingCaption("2026-09-03", "2026-08-14"), "Booked 3 Sep");
  assert.equal(bookingCaption("2026-08-13", "2026-08-14"), null);
  assert.equal(bookingCaption(null, "2026-08-14"), null);
});

test("the year appears only once it is not the obvious one", () => {
  assert.equal(shortDate("2026-09-03", "2026-08-14"), "3 Sep");
  assert.equal(shortDate("2027-09-03", "2026-08-14"), "3 Sep 2027");
  assert.equal(shortDate("2025-12-31", "2026-08-14"), "31 Dec 2025");
  assert.equal(shortDate("2026-01-01", "2026-08-14"), "1 Jan");
});

test("no raw ISO date ever reaches a screen", () => {
  // The leak lib/dates.ts was written for, fixed twice already. Not a third time.
  for (const s of [
    shortDate("2026-09-03", "2026-08-14"),
    shortDate("2027-09-03", "2026-08-14"),
    longDate("2026-09-03"),
    bookingCaption("2026-09-03", "2026-08-14") ?? "",
    bookingNote("2026-09-03", "2026-08-14") ?? "",
    bookingNote("2026-08-13", "2026-08-14") ?? "",
  ]) {
    assert.doesNotMatch(s, /\d{4}-\d{2}-\d{2}/, `raw ISO date in "${s}"`);
  }
  assert.equal(longDate("2026-09-03"), "3 September 2026");
  assert.equal(longDate("2026-01-01"), "1 January 2026");
});

test("the record says a missed booking out loud, and never says a booking makes it fine", () => {
  const live = bookingNote("2026-09-03", "2026-08-14") ?? "";
  assert.match(live, /3 September 2026/);
  assert.match(live, /still counts as outstanding/);

  const missed = bookingNote("2026-08-13", "2026-08-14") ?? "";
  assert.match(missed, /13 August 2026/);
  assert.match(missed, /missed/);

  assert.equal(bookingNote(null, "2026-08-14"), null);
});

test("no dashes in anything a customer reads", () => {
  // Standing rule: no dashes in customer facing copy.
  for (const s of [
    bookingCaption("2026-09-03", "2026-08-14") ?? "",
    bookingNote("2026-09-03", "2026-08-14") ?? "",
    bookingNote("2026-08-13", "2026-08-14") ?? "",
    longDate("2026-09-03"),
    shortDate("2027-09-03", "2026-08-14"),
  ]) {
    assert.doesNotMatch(s, /[-–—]/, `dash in "${s}"`);
  }
});

test("the client note and the server note are the same sentence", () => {
  // Two entry points, one string. The dialog reads the state the server already worked out; the
  // server reads a date and a day. They must not be able to say different things about one
  // booking, which is what a second copy of the wording would eventually do.
  for (const [booked, today] of [
    ["2026-09-03", "2026-08-14"],
    ["2026-08-14", "2026-08-14"],
    ["2026-08-13", "2026-08-14"],
    ["2025-01-01", "2026-08-14"],
  ] as const) {
    assert.equal(bookingNoteFor(bookingState(booked, today), booked), bookingNote(booked, today));
  }
  assert.equal(bookingNoteFor("none", "2026-09-03"), null);
  assert.equal(bookingNoteFor("booked", null), null);
});

/* ---------------------------------------------------------------------------
 * What a save writes. These are the tests for the defect that nearly shipped on 2026-08-14.
 * ------------------------------------------------------------------------- */

test("BOOKING A ONE OFF COURSE THAT IS ALREADY DONE MUST NOT UNDO IT", () => {
  /*
   * The one that review caught. A one off course ticked in a spreadsheet import is stored as
   * completed with NO dates, and the dialog shows no renewal field for a one off, so both date
   * fields submit blank. Deciding "booking only means not done" from the form alone wrote
   * status 'not_done' over a completed record and dropped the company's compliance figure.
   */
  const plan = trainingWritePlan({
    completed: null,
    expiry: null,
    bookedFor: "2026-09-03",
    existing: { status: "completed", completedOn: null, expiryOn: null },
  });
  assert.equal(plan.status, "completed", "a completed record must stay completed");
  assert.equal(plan.bookedFor, "2026-09-03");
  assert.equal(plan.bookingOnly, true);
});

test("a booking never touches the dates a record already holds", () => {
  // A recurring course later switched to one off keeps its expiry in the database while the
  // dialog stops rendering the field. Booking it must not null that date either.
  const plan = trainingWritePlan({
    completed: null,
    expiry: null,
    bookedFor: "2026-11-20",
    existing: { status: "completed", completedOn: "2026-01-10", expiryOn: "2027-01-10" },
  });
  assert.equal(plan.completedOn, "2026-01-10");
  assert.equal(plan.expiryOn, "2027-01-10");
  assert.equal(plan.status, "completed");
});

test("booking somebody onto a course they have NEVER done leaves it not done", () => {
  const plan = trainingWritePlan({
    completed: null,
    expiry: null,
    bookedFor: "2026-09-03",
    existing: null,
  });
  assert.equal(plan.status, "not_done", "a booking is not a completion");
  assert.equal(plan.completedOn, null);
  assert.equal(plan.expiryOn, null);
  assert.equal(plan.bookingOnly, true);
});

test("dates submitted are written as given, and record a completion", () => {
  const plan = trainingWritePlan({
    completed: "2026-08-14",
    expiry: "2028-08-14",
    bookedFor: null,
    existing: { status: "not_done", completedOn: null, expiryOn: null },
  });
  assert.equal(plan.status, "completed");
  assert.equal(plan.completedOn, "2026-08-14");
  assert.equal(plan.expiryOn, "2028-08-14");
  assert.equal(plan.bookingOnly, false);
});

test("a renewal date on its own is still a completion, not a booking", () => {
  // The importer's own shape: a training matrix is kept in renewal dates, not completion dates.
  const plan = trainingWritePlan({
    completed: null,
    expiry: "2027-03-01",
    bookedFor: null,
    existing: null,
  });
  assert.equal(plan.status, "completed");
  assert.equal(plan.bookingOnly, false);
});

test("clearing the booking date cancels the booking and leaves everything else alone", () => {
  const plan = trainingWritePlan({
    completed: null,
    expiry: null,
    bookedFor: null,
    existing: { status: "completed", completedOn: "2026-01-10", expiryOn: "2027-01-10" },
  });
  assert.equal(plan.bookedFor, null);
  assert.equal(plan.status, "completed");
  assert.equal(plan.completedOn, "2026-01-10");
  assert.equal(plan.expiryOn, "2027-01-10");
});
