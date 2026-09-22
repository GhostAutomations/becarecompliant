import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDeletePerson,
  deleteRefusalReason,
  nameConfirmed,
  trainingRowHoldsSomething,
  TRAINING_HOLDS_SOMETHING_FILTER,
  type PersonFootprint,
} from "./deletable.ts";

const CLEAN: PersonFootprint = {
  evidence: 0,
  completedChecks: 0,
  training: 0,
  absences: 0,
  holidays: 0,
  incidents: 0,
  complaints: 0,
  plannerBookings: 0,
  formSubmissions: 0,
  signedAssignments: 0,
  retentionHold: false,
};

test("a record with nothing against it can go", () => {
  assert.equal(canDeletePerson(CLEAN), true);
  assert.equal(deleteRefusalReason(CLEAN), null);
});

test("one completed Form is enough to refuse, and it says so", () => {
  const r = deleteRefusalReason({ ...CLEAN, evidence: 1 })!;
  assert.match(r, /a completed Form/);
  assert.match(r, /destroy evidence/);
  assert.match(r, /leaver/);
});

test("the sentence counts and lists what is in the way", () => {
  const r = deleteRefusalReason({ ...CLEAN, completedChecks: 2, holidays: 1 })!;
  assert.match(r, /2 completed checks and a holiday request/);
});

test("three things read as a list, not a run-on", () => {
  const r = deleteRefusalReason({ ...CLEAN, evidence: 1, training: 3, incidents: 2 })!;
  assert.match(r, /a completed Form, 3 training records and 2 incidents/);
});

test("a retention hold outranks everything and says what to do", () => {
  const r = deleteRefusalReason({ ...CLEAN, retentionHold: true })!;
  assert.match(r, /retention hold/);
  assert.equal(/completed/.test(r), false);
});

test("a retention hold refuses even a record that is otherwise clean", () => {
  assert.equal(canDeletePerson({ ...CLEAN, retentionHold: true }), false);
});

test("every kind of footprint blocks", () => {
  for (const key of Object.keys(CLEAN) as Array<keyof PersonFootprint>) {
    if (key === "retentionHold") continue;
    assert.equal(
      canDeletePerson({ ...CLEAN, [key]: 1 }),
      false,
      `${key} should stop a delete`,
    );
  }
});

/*
 * TYPING THE NAME (2026-09-22). Found in the browser: the guard was a greyed out style, and a
 * keyboard went straight past it. The server now asks the same question as the form.
 */

test("nothing typed is not a confirmation", () => {
  assert.equal(nameConfirmed("", "ZZ TEST Delete Me"), false);
  assert.equal(nameConfirmed(null, "ZZ TEST Delete Me"), false);
  assert.equal(nameConfirmed(undefined, "ZZ TEST Delete Me"), false);
  assert.equal(nameConfirmed("   ", "ZZ TEST Delete Me"), false);
});

test("the exact name confirms, forgiving case and stray spaces", () => {
  assert.equal(nameConfirmed("ZZ TEST Delete Me", "ZZ TEST Delete Me"), true);
  assert.equal(nameConfirmed("zz test delete me", "ZZ TEST Delete Me"), true);
  assert.equal(nameConfirmed("  ZZ  TEST Delete   Me ", "ZZ TEST Delete Me"), true);
});

test("a different or partial name does not", () => {
  assert.equal(nameConfirmed("ZZ TEST", "ZZ TEST Delete Me"), false);
  assert.equal(nameConfirmed("Mary Ikpi-Ubi", "Mary Ikpi Ubi"), false);
  assert.equal(nameConfirmed("ZZ TEST Delete Me2", "ZZ TEST Delete Me"), false);
});

test("a record with no name can never be confirmed, so it cannot be deleted by typing nothing", () => {
  assert.equal(nameConfirmed("", ""), false);
  assert.equal(nameConfirmed("", "   "), false);
});

/*
 * AN EMPTY TRAINING ROW IS NOT A TRAINING RECORD (2026-09-22). A cancelled booking left one
 * behind and Delete person called it evidence.
 */
const EMPTY = { status: "not_done", completed_on: null, expiry_on: null, booked_for: null, certificate_path: null };

test("the row a cancelled booking leaves behind holds nothing", () => {
  assert.equal(trainingRowHoldsSomething(EMPTY), false);
});

test("anything real on the row counts", () => {
  assert.equal(trainingRowHoldsSomething({ ...EMPTY, status: "completed" }), true); // a one off ticked Completed, no dates
  assert.equal(trainingRowHoldsSomething({ ...EMPTY, completed_on: "2026-03-01" }), true);
  assert.equal(trainingRowHoldsSomething({ ...EMPTY, expiry_on: "2027-03-01" }), true);
  assert.equal(trainingRowHoldsSomething({ ...EMPTY, booked_for: "2026-10-15" }), true); // a live booking
  assert.equal(trainingRowHoldsSomething({ ...EMPTY, certificate_path: "c/x.pdf" }), true);
});

test("the database filter asks about exactly the same things as the function", () => {
  for (const part of [
    "status.eq.completed",
    "completed_on.not.is.null",
    "expiry_on.not.is.null",
    "booked_for.not.is.null",
    "certificate_path.not.is.null",
  ]) {
    assert.ok(TRAINING_HOLDS_SOMETHING_FILTER.split(",").includes(part), part);
  }
  assert.equal(TRAINING_HOLDS_SOMETHING_FILTER.split(",").length, 5);
});
