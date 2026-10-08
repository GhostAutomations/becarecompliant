import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMeetingPrompt,
  clip,
  discussedAbsences,
  meetingNotesFromAnswers,
  rtwNotesFromAnswers,
  rtwNotesFromPortal,
  MEETING_QUESTIONS_SYSTEM,
  redactName,
  weekdayOf,
} from "./meeting-questions.ts";

const thresholds = [
  { stage: 1, occasions: 3 },
  { stage: 2, occasions: 5 },
  { stage: 3, occasions: 7 },
];
const six = ["a", "b", "c", "d", "e", "f"];

test("discussedAbsences: Stage 1 covers the occasions up to its trigger", () => {
  assert.deepEqual(discussedAbsences(six, 1, thresholds), [
    { e: "a", n: 1 },
    { e: "b", n: 2 },
    { e: "c", n: 3 },
  ]);
});

test("discussedAbsences: Stage 2 covers the new ones since Stage 1, numbers kept", () => {
  assert.deepEqual(discussedAbsences(six, 2, thresholds), [
    { e: "d", n: 4 },
    { e: "e", n: 5 },
  ]);
});

test("discussedAbsences: no stage, no thresholds or an empty slice means all of them", () => {
  assert.equal(discussedAbsences(six, null, thresholds).length, 6);
  assert.equal(discussedAbsences(six, 1, []).length, 6);
  assert.equal(discussedAbsences(["a"], 3, thresholds).length, 1);
});

test("discussedAbsences: an empty stage slice gives the newest ones, never all (recheck 2026-10-08)", () => {
  // Stage 3 spans absences 6 and 7; only four exist: the newest two, not all four.
  assert.deepEqual(discussedAbsences(["a", "b", "c", "d"], 3, thresholds), [
    { e: "c", n: 3 },
    { e: "d", n: 4 },
  ]);
});

test("clip collapses whitespace and cuts long text", () => {
  assert.equal(clip("  a \n b  "), "a b");
  assert.equal(clip("abcdef", 4), "abc…");
  assert.equal(clip(null), "");
});

test("rtwNotesFromAnswers keeps the useful answers and never the signatures", () => {
  const notes = rtwNotesFromAnswers({
    absence_summary: "Off with a cold.",
    tailored_questions: "Fit to return? Yes",
    referral: "None",
    employee_signature: "data:image/png;base64,AAAA",
    conducted_by: "Phil Davies",
  });
  assert.match(notes, /summary: Off with a cold/);
  assert.match(notes, /questions and answers: Fit to return\? Yes/);
  assert.doesNotMatch(notes, /base64|Phil/);
});

test("rtwNotesFromPortal pairs questions with answers and skips blanks", () => {
  const notes = rtwNotesFromPortal(
    [
      { question: "Are you fit to return?", type: "yes_no" },
      { question: "Anything else?", type: "text" },
    ],
    ["Yes", ""],
  );
  assert.equal(notes, "their own answers before the interview: Are you fit to return? Yes");
  assert.equal(rtwNotesFromPortal([{ question: "Q", type: "text" }], null), "");
});

test("meetingNotesFromAnswers keeps what was agreed", () => {
  const notes = meetingNotesFromAnswers({
    improvement_targets: "No more than one absence in three months",
    warning_issued: "Verbal warning",
    name: "Jane",
  });
  assert.match(notes, /warning: Verbal warning/);
  assert.match(notes, /targets: No more than one absence/);
  assert.doesNotMatch(notes, /Jane/);
});

test("buildMeetingPrompt names the stage and what it can lead to, and lists the absences", () => {
  const prompt = buildMeetingPrompt({
    stage: 2,
    stageAction: "Written warning",
    discussed: [{ n: 4, a: { start_date: "2026-09-01", end_date: "2026-09-02", days: 2, reason: "Migraine" } }],
    otherCounted: [{ n: 1, a: { start_date: "2026-06-01", end_date: null, days: 1, reason: null } }],
    rtw: [{ n: 4, notes: "summary: back on light duties" }],
    earlierMeetings: [{ stage: 1, date: "2026-07-01", notes: "targets: improve" }],
    discountedCount: 1,
  });
  assert.match(prompt, /Stage 2 absence management meeting/);
  assert.match(prompt, /up to and including: Written warning/);
  assert.match(prompt, /Absence 4: 2026-09-01 to 2026-09-02, 2 days, reason given: Migraine/);
  assert.match(prompt, /Absence 1: 2026-06-01, 1 day, reason given: not recorded/);
  assert.match(prompt, /After absence 4: summary: back on light duties/);
  assert.match(prompt, /Stage 1 on 2026-07-01: targets: improve/);
  assert.match(prompt, /1 other absence was discounted/);
});

test("buildMeetingPrompt without a booking or a Return to Work still reads sensibly", () => {
  const prompt = buildMeetingPrompt({
    stage: null,
    stageAction: null,
    discussed: [],
    otherCounted: [],
    rtw: [],
    earlierMeetings: [],
    discountedCount: 0,
  });
  assert.match(prompt, /^This is a formal absence management meeting\./);
  assert.match(prompt, /Return to Work interviews:\n- none recorded/);
  assert.doesNotMatch(prompt, /discounted/);
});

test("the instructions keep the guardrails and have no dashes in what the model is told to write", () => {
  assert.match(MEETING_QUESTIONS_SYSTEM, /Never diagnose/);
  assert.match(MEETING_QUESTIONS_SYSTEM, /never suggest an outcome, a warning or dismissal/);
  assert.match(MEETING_QUESTIONS_SYSTEM, /STRICT JSON/);
});

test("weekday of a civil date", () => {
  assert.equal(weekdayOf("2026-10-07"), "Wednesday");
  assert.equal(weekdayOf("2028-02-29"), "Tuesday");
  assert.equal(weekdayOf(null), null);
});

test("the employee's name is taken out of the reason text", () => {
  assert.equal(redactName("Zoe said she doesn't feel well", "Zoe Sample"), "the employee said she doesn't feel well");
  assert.equal(redactName("Sam's wife called. SAMPLE was off", "Sam Sample"), "the employee's wife called. the employee was off");
  assert.equal(redactName("Samantha phoned", "Sam Sample"), "Samantha phoned"); // whole words only
  assert.equal(redactName(null, "Sam Sample"), "");
});
