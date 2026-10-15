import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnLeave,
  isPausedPersonCheck,
  leaveBadge,
  leavePausedLabel,
  leaveReturnDateProblem,
  leaveReturnQuestion,
  leaveSlot,
  resumeDate,
  trainingLeave,
} from "./leave-pause.ts";

test("Parental Leave and Long Term Sick are on leave; Active and Leaver are not", () => {
  assert.equal(isOnLeave("mat_leave"), true);
  assert.equal(isOnLeave("lts"), true);
  assert.equal(isOnLeave("active"), false);
  assert.equal(isOnLeave("leaver"), false);
  assert.equal(isOnLeave(null), false);
});

test("the badges are PL and LTS", () => {
  assert.equal(leaveBadge("mat_leave"), "PL");
  assert.equal(leaveBadge("lts"), "LTS");
  assert.equal(leaveBadge("active"), null);
});

test("a dated check is paused on leave; a one off already done and an undated check are not", () => {
  const base = { employmentStatus: "mat_leave", recurring: true, lastCompletedOn: null, dueDate: "2026-10-07" };
  assert.equal(isPausedPersonCheck(base), true);
  assert.equal(isPausedPersonCheck({ ...base, employmentStatus: "lts" }), true);
  assert.equal(isPausedPersonCheck({ ...base, employmentStatus: "active" }), false);
  assert.equal(isPausedPersonCheck({ ...base, dueDate: null }), false);
  assert.equal(isPausedPersonCheck({ ...base, recurring: false, lastCompletedOn: "2026-01-01" }), false);
  assert.equal(isPausedPersonCheck({ ...base, recurring: false, lastCompletedOn: null }), true);
});

test("the pill and the return question are worded for each kind of leave, with no dashes", () => {
  assert.equal(leavePausedLabel("2026-10-15", "mat_leave"), "Paused: on parental leave since 15 October 2026");
  assert.equal(leavePausedLabel("2026-10-15", "lts"), "Paused: on long term sick since 15 October 2026");
  assert.equal(leavePausedLabel(null, "lts"), "Paused: on long term sick");
  assert.equal(leaveReturnQuestion("lts"), "Date they came back from long term sick");
  assert.equal(leaveReturnQuestion("mat_leave"), "Date they came back from parental leave");
});

test("the return date: required, not in the future, not before the leave began", () => {
  assert.equal(leaveReturnDateProblem("", "2026-10-15", null, "mat_leave"), "Enter the date they came back from parental leave.");
  assert.equal(leaveReturnDateProblem("2026-10-16", "2026-10-15", null, "lts"), "The date they came back from long term sick cannot be in the future.");
  assert.equal(
    leaveReturnDateProblem("2026-10-01", "2026-10-15", "2026-10-05", "mat_leave"),
    "The date they came back from parental leave is before the date their leave began (5 October 2026).",
  );
  assert.equal(leaveReturnDateProblem("2026-10-15", "2026-10-15", "2026-10-05", "mat_leave"), null);
});

test("return + 7 crosses month, year and leap day", () => {
  assert.equal(resumeDate("2026-10-28"), "2026-11-04");
  assert.equal(resumeDate("2026-12-28"), "2027-01-04");
  assert.equal(resumeDate("2028-02-25"), "2028-03-03");
  assert.equal(resumeDate("2028-02-22"), "2028-02-29");
});

test("a worked out cycle slot: paused on leave, return + 7 after, untouched otherwise", () => {
  const ragFor = () => "amber";
  const onLeave = { employmentStatus: "mat_leave", leaveReturnedOn: null };
  assert.deepEqual(leaveSlot("2026-09-01", "red", onLeave, ragFor), { due: "2026-09-01", rag: "paused" });
  assert.deepEqual(leaveSlot(null, "none", onLeave, ragFor), { due: null, rag: "none" });
  const back = { employmentStatus: "active", leaveReturnedOn: "2026-10-13" };
  assert.deepEqual(leaveSlot("2026-09-01", "red", back, ragFor), { due: "2026-10-20", rag: "amber" });
  assert.deepEqual(leaveSlot("2026-12-01", "green", back, ragFor), { due: "2026-12-01", rag: "green" });
  const never = { employmentStatus: "active", leaveReturnedOn: null };
  assert.deepEqual(leaveSlot("2026-09-01", "red", never, ragFor), { due: "2026-09-01", rag: "red" });
});

test("training on leave is paused, except a one off already done", () => {
  const base = { employmentStatus: "lts", leaveReturnedOn: null, done: true, oneOff: false, expiryOn: "2026-09-01", todayIso: "2026-10-15" };
  assert.deepEqual(trainingLeave(base), { paused: true, expiryOn: "2026-09-01", graceUntil: null });
  assert.equal(trainingLeave({ ...base, done: false, expiryOn: null }).paused, true);
  assert.equal(trainingLeave({ ...base, oneOff: true, expiryOn: null }).paused, false);
});

test("back from leave, a renewal due before return + 7 is due on return + 7; later ones keep their dates", () => {
  const base = { employmentStatus: "active", leaveReturnedOn: "2026-10-13", done: true, oneOff: false, todayIso: "2026-10-15" };
  assert.deepEqual(trainingLeave({ ...base, expiryOn: "2026-09-01" }), { paused: false, expiryOn: "2026-10-20", graceUntil: null });
  assert.equal(trainingLeave({ ...base, expiryOn: "2027-01-01" }).expiryOn, "2027-01-01");
  assert.equal(trainingLeave({ ...base, expiryOn: null }).expiryOn, null);
});

test("back from leave, a course never done has until return + 7, then is overdue as before", () => {
  const base = { employmentStatus: "active", leaveReturnedOn: "2026-10-13", done: false, oneOff: false, expiryOn: null };
  assert.equal(trainingLeave({ ...base, todayIso: "2026-10-15" }).graceUntil, "2026-10-20");
  assert.equal(trainingLeave({ ...base, todayIso: "2026-10-20" }).graceUntil, "2026-10-20");
  assert.equal(trainingLeave({ ...base, todayIso: "2026-10-21" }).graceUntil, null);
});

test("nobody who has not been on leave is touched", () => {
  const r = trainingLeave({ employmentStatus: "active", leaveReturnedOn: null, done: true, oneOff: false, expiryOn: "2026-09-01", todayIso: "2026-10-15" });
  assert.deepEqual(r, { paused: false, expiryOn: "2026-09-01", graceUntil: null });
});
