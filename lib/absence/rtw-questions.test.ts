import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ukMobileToE164,
  lastFour,
  rtwSmsBody,
  rtwQuestionsPill,
  changedAnswerNumbers,
  rtwProvenanceNote,
  rtwPortalPath,
} from "./rtw-questions.ts";

test("UK mobiles are read every way people type them", () => {
  assert.equal(ukMobileToE164("07700 900123"), "+447700900123");
  assert.equal(ukMobileToE164("+44 7700 900123"), "+447700900123");
  assert.equal(ukMobileToE164("447700900123"), "+447700900123");
  assert.equal(ukMobileToE164("0044 7700 900123"), "+447700900123");
  assert.equal(ukMobileToE164("(0)7700-900-123"), "+447700900123");
});

test("anything that is not a UK mobile is refused", () => {
  assert.equal(ukMobileToE164("02920 123456"), null, "a landline");
  assert.equal(ukMobileToE164("0770090012"), null, "a digit short");
  assert.equal(ukMobileToE164("+1 415 555 0100"), null, "abroad");
  assert.equal(ukMobileToE164(""), null);
  assert.equal(ukMobileToE164(null), null);
});

test("only the last four digits are shown", () => {
  assert.equal(lastFour("+447700900123"), "0123");
});

test("the text names the employer, links to the portal and has no dashes", () => {
  const body = rtwSmsBody({
    firstName: "Jamie",
    companyName: "Thistle Care Ltd",
    link: "https://www.becarecompliant.com" + rtwPortalPath("abc"),
  });
  assert.match(body, /^Hi Jamie, Thistle Care Ltd would like you/);
  assert.match(body, /https:\/\/www\.becarecompliant\.com\/my\/return-to-work\/abc$/);
  assert.doesNotMatch(body.replace(/https?:\S+/, ""), /[-–—]/);
});

test("the tile pill follows the questions", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  assert.equal(rtwQuestionsPill(null, now), null);
  assert.equal(rtwQuestionsPill({ status: "drafted", expiresAt: null }, now), null);
  assert.deepEqual(rtwQuestionsPill({ status: "sent", expiresAt: "2026-10-01T12:00:00Z" }, now), {
    label: "Questions sent",
    className: "pill-amber",
  });
  assert.deepEqual(rtwQuestionsPill({ status: "sent", expiresAt: "2026-09-24T12:00:00Z" }, now), {
    label: "Link expired",
    className: "pill-red",
  });
  assert.deepEqual(rtwQuestionsPill({ status: "answered", expiresAt: null }, now), {
    label: "Answers in",
    className: "pill-green",
  });
  assert.equal(rtwQuestionsPill({ status: "recorded", expiresAt: null }, now), null);
});

test("changed answers are numbered from one, ignoring spaces", () => {
  assert.deepEqual(changedAnswerNumbers(["Yes", "Back pain", "No"], ["Yes ", "Back pain, better now", "No"]), [2]);
  assert.deepEqual(changedAnswerNumbers(["a", "b"], ["a", "b"]), []);
});

test("the Evidence says who answered and who changed what", () => {
  assert.equal(
    rtwProvenanceNote({ firstName: "Jamie", answeredAtIso: "2026-09-25T09:00:00Z", changed: [], changedByName: null }),
    "Answered by Jamie through their portal on 25/09/2026.",
  );
  assert.equal(
    rtwProvenanceNote({ firstName: "Jamie", answeredAtIso: "2026-09-25T09:00:00Z", changed: [3], changedByName: "Charlotte Evans" }),
    "Answered by Jamie through their portal on 25/09/2026. The answer to question 3 was changed by Charlotte Evans after speaking to them.",
  );
  assert.equal(
    rtwProvenanceNote({ firstName: "Jamie", answeredAtIso: "2026-09-25T23:30:00Z", changed: [1, 2, 4], changedByName: "Phil" }),
    "Answered by Jamie through their portal on 26/09/2026. The answers to questions 1, 2 and 4 were changed by Phil after speaking to them.",
  );
});
