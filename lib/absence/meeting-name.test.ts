import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMeetingName, meetingNameAsTitle, meetingNameInSentence } from "./meeting-name.ts";

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
