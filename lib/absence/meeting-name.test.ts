import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMeetingName, meetingChipLabel, meetingNameAsTitle, meetingNameInSentence } from "./meeting-name.ts";

test("blank or the default is stored as nothing", () => {
  assert.deepEqual(cleanMeetingName("  "), { name: null });
  assert.deepEqual(cleanMeetingName("Absence management meeting"), { name: null });
});

test("a company name for the meeting is kept, tidied", () => {
  assert.deepEqual(cleanMeetingName("  Disciplinary   hearing "), { name: "Disciplinary hearing" });
});

test("dashes and very long names are refused", () => {
  assert.ok("error" in cleanMeetingName("Disciplinary — hearing"));
  assert.ok("error" in cleanMeetingName("x".repeat(61)));
});

test("reads correctly in a sentence and as a heading", () => {
  assert.equal(meetingNameInSentence("Disciplinary hearing"), "disciplinary hearing");
  assert.equal(meetingNameInSentence(null), "absence management meeting");
  assert.equal(meetingNameInSentence("HR review"), "HR review");
  assert.equal(meetingNameAsTitle("Disciplinary hearing"), "Disciplinary Hearing");
  assert.equal(meetingNameAsTitle(null), "Absence Management Meeting");
});

test("the planner chip label is short", () => {
  assert.equal(meetingChipLabel(2, "Disciplinary hearing"), "Stage 2 hearing");
  assert.equal(meetingChipLabel(1, null), "Stage 1 meeting");
  assert.equal(meetingChipLabel(null, "Disciplinary hearing"), "Hearing");
});
