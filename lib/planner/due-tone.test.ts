import test from "node:test";
import assert from "node:assert/strict";
import { dueTone, earliestDue } from "./due-tone.ts";

test("earliest due date wins, ignoring tasks with none", () => {
  assert.equal(earliestDue(["2026-10-20", null, "2026-10-12", undefined]), "2026-10-12");
  assert.equal(earliestDue([null, undefined]), null);
  assert.equal(earliestDue([]), null);
});

test("red once the due date has gone, whatever the booking date", () => {
  assert.equal(dueTone("2026-10-04", "2026-10-05", "2026-10-05"), "red");
});

test("amber when booked for after the due date", () => {
  assert.equal(dueTone("2026-10-08", "2026-10-10", "2026-10-05"), "amber");
});

test("plain when booked on or before the due date, or with no due date", () => {
  assert.equal(dueTone("2026-10-12", "2026-10-05", "2026-10-05"), null);
  assert.equal(dueTone("2026-10-05", "2026-10-05", "2026-10-05"), null, "due today and booked today is on time");
  assert.equal(dueTone(null, "2026-10-05", "2026-10-05"), null);
});
