import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import {
  londonTodayIso,
  holidayHasStarted,
  carerHolidayOptions,
  holidayStatusLabel,
  officeChangeLabel,
  noticeTitle,
  noticeLine,
  noticeByLine,
  eventKindLabel,
} from "./changes.ts";
import { backAtWorkFor, nextDayIso } from "./changes.ts";

const approved = { status: "approved", start_date: "2026-10-20", end_date: "2026-10-24" };

test("London's date, not UTC's, around midnight in summer and winter", () => {
  // 23:30 UTC on 9 Oct is 00:30 on 10 Oct in London (BST).
  assert.equal(londonTodayIso(new Date("2026-10-09T23:30:00Z")), "2026-10-10");
  // In winter London is on UTC.
  assert.equal(londonTodayIso(new Date("2026-12-01T23:30:00Z")), "2026-12-01");
  // The night the clocks go back (25 Oct 2026, 02:00 BST becomes 01:00 GMT).
  assert.equal(londonTodayIso(new Date("2026-10-24T23:10:00Z")), "2026-10-25");
});

test("a holiday has started on its first day, not the day before", () => {
  assert.equal(holidayHasStarted(approved, "2026-10-19"), false);
  assert.equal(holidayHasStarted(approved, "2026-10-20"), true);
  assert.equal(holidayHasStarted(approved, "2026-10-22"), true);
});

test("with a change waiting, the dates first agreed count as the start too", () => {
  const waiting = {
    status: "pending",
    start_date: "2026-11-02",
    end_date: "2026-11-06",
    change_kind: "amend",
    previous_start_date: "2026-10-20",
    previous_end_date: "2026-10-24",
  };
  assert.equal(holidayHasStarted(waiting, "2026-10-19"), false);
  assert.equal(holidayHasStarted(waiting, "2026-10-20"), true);
});

test("an approved holiday before it starts: change or cancel, nothing to withdraw", () => {
  assert.deepEqual(carerHolidayOptions(approved, "2026-10-10"), {
    changeDates: true,
    cancel: true,
    withdrawChange: false,
    started: false,
  });
});

test("from its first day only the office can change it", () => {
  const o = carerHolidayOptions(approved, "2026-10-20");
  assert.equal(o.changeDates, false);
  assert.equal(o.cancel, false);
  assert.equal(o.started, true);
});

test("a change waiting: change it again, ask to cancel, or take it back", () => {
  const o = carerHolidayOptions(
    { status: "pending", start_date: "2026-11-02", end_date: "2026-11-06", change_kind: "amend", previous_start_date: "2026-10-20", previous_end_date: "2026-10-24" },
    "2026-10-10",
  );
  assert.deepEqual(o, { changeDates: true, cancel: true, withdrawChange: true, started: false });
});

test("a cancellation waiting: only take it back", () => {
  const o = carerHolidayOptions(
    { status: "pending", start_date: "2026-10-20", end_date: "2026-10-24", change_kind: "cancel", previous_start_date: "2026-10-20", previous_end_date: "2026-10-24" },
    "2026-10-10",
  );
  assert.deepEqual(o, { changeDates: false, cancel: false, withdrawChange: true, started: false });
});

test("taking back a change stays possible even once the agreed dates have arrived", () => {
  const o = carerHolidayOptions(
    { status: "pending", start_date: "2026-11-02", end_date: "2026-11-06", change_kind: "amend", previous_start_date: "2026-10-20", previous_end_date: "2026-10-24" },
    "2026-10-21",
  );
  assert.equal(o.withdrawChange, true);
  assert.equal(o.changeDates, false);
});

test("declined and cancelled holidays offer nothing", () => {
  for (const status of ["declined", "cancelled"]) {
    assert.deepEqual(carerHolidayOptions({ ...approved, status }, "2026-10-10"), {
      changeDates: false,
      cancel: false,
      withdrawChange: false,
      started: false,
    });
  }
});

test("a new request waiting is changed or withdrawn, with no change to take back", () => {
  const o = carerHolidayOptions({ status: "pending", start_date: "2026-10-20", end_date: "2026-10-24", change_kind: null }, "2026-10-10");
  assert.deepEqual(o, { changeDates: true, cancel: true, withdrawChange: false, started: false });
});

test("status labels the carer sees", () => {
  assert.equal(holidayStatusLabel({ ...approved, status: "pending" }), "Waiting for approval");
  assert.equal(holidayStatusLabel({ ...approved, status: "pending", change_kind: "amend" }), "Change waiting for approval");
  assert.equal(holidayStatusLabel({ ...approved, status: "pending", change_kind: "cancel" }), "Cancellation waiting for approval");
  assert.equal(holidayStatusLabel(approved), "Approved");
  assert.equal(holidayStatusLabel({ ...approved, status: "declined" }), "Declined");
  assert.equal(holidayStatusLabel({ ...approved, status: "cancelled" }), "Cancelled");
});

test("the office's labels name a change, and leave an ordinary request alone", () => {
  assert.equal(officeChangeLabel({ ...approved, status: "pending", change_kind: "amend" }), "Change of holiday");
  assert.equal(officeChangeLabel({ ...approved, status: "pending", change_kind: "cancel" }), "Cancellation request");
  assert.equal(officeChangeLabel({ ...approved, status: "pending" }), null);
  assert.equal(officeChangeLabel(approved), null);
});

const KINDS = ["amended", "cancelled", "change_approved", "change_declined", "cancel_approved", "cancel_declined"];

test("every notice reads as a sentence with UK dates and no dashes", () => {
  for (const kind of KINDS) {
    const n = {
      kind,
      old_start_date: "2026-10-20",
      old_end_date: "2026-10-24",
      new_start_date: kind.startsWith("cancel") || kind === "cancelled" ? null : "2026-11-02",
      new_end_date: kind.startsWith("cancel") || kind === "cancelled" ? null : "2026-11-06",
    };
    const title = noticeTitle(kind);
    const line = noticeLine(n);
    assert.ok(title.length > 0, kind);
    assert.ok(line.length > 0, kind);
    assert.doesNotMatch(`${title} ${line}`, /[–—]| - /, `${kind} has a dash`);
    assert.doesNotMatch(line, /\d{4}-\d{2}-\d{2}/, `${kind} prints a raw date`);
  }
});

test("what each notice says", () => {
  assert.equal(
    noticeLine({ kind: "amended", old_start_date: "2026-10-20", old_end_date: "2026-10-24", new_start_date: "2026-11-02", new_end_date: "2026-11-06" }),
    "It now runs from 2 November 2026 to 6 November 2026. It was 20 October 2026 to 24 October 2026.",
  );
  // A declined change: the dates kept are the NEW ones in the history row, the ones asked for the old.
  assert.equal(
    noticeLine({ kind: "change_declined", old_start_date: "2026-11-02", old_end_date: "2026-11-06", new_start_date: "2026-10-20", new_end_date: "2026-10-24" }),
    "It stays from 20 October 2026 to 24 October 2026, as first agreed. You had asked for 2 November 2026 to 6 November 2026.",
  );
  assert.equal(
    noticeLine({ kind: "cancelled", old_start_date: "2026-10-20", old_end_date: "2026-10-20", new_start_date: null, new_end_date: null }),
    "The holiday from 20 October 2026 will not go ahead.",
  );
  assert.equal(noticeTitle("cancel_declined"), "Your holiday stays booked");
});

test("who did it and on which London day", () => {
  assert.equal(noticeByLine("Bev Admin", "2026-10-09T23:30:00Z"), "By Bev Admin on 10 October 2026.");
  assert.equal(noticeByLine(null, "2026-10-09T10:00:00Z"), "On 9 October 2026.");
});

test("every history row has a plain label with no dashes", () => {
  const all = [
    "amended", "cancelled", "request_amended", "request_withdrawn", "change_requested",
    "cancel_requested", "change_withdrawn", "change_approved", "change_declined",
    "cancel_approved", "cancel_declined",
  ];
  for (const k of all) {
    const label = eventKindLabel(k);
    assert.notEqual(label, k, `${k} has no label`);
    assert.doesNotMatch(label, /[\u2013\u2014]| - |_/, `${k}: ${label}`);
  }
});

test("back at work starts as the day after the holiday, or the date it already has if later", () => {
  assert.equal(nextDayIso("2026-10-31"), "2026-11-01");
  assert.equal(nextDayIso("2028-02-28"), "2028-02-29");
  assert.equal(nextDayIso("2026-12-31"), "2027-01-01");
  assert.equal(backAtWorkFor("2026-10-23", null), "2026-10-24");
  assert.equal(backAtWorkFor("2026-10-23", "2026-10-23"), "2026-10-24");
  assert.equal(backAtWorkFor("2026-10-23", "2026-10-26"), "2026-10-26");
});
