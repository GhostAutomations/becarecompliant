import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeletePerson, deleteRefusalReason, nameConfirmed, type PersonFootprint } from "./deletable.ts";

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
