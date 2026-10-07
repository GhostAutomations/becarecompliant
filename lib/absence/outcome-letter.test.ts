import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME_SYSTEM,
  buildOutcomePrompt,
  cleanOutcomeBody,
  letterParagraphs,
  normaliseApprovedBody,
  outcomeFacts,
  slashDate,
} from "./outcome-letter.ts";

test("outcomeFacts keeps the record and never the name or signatures", () => {
  const facts = outcomeFacts({
    name: "Jane Smith",
    meeting_type: "Stage 1",
    date_of_meeting: "2026-09-29",
    employees_explanation: "Two colds.",
    meeting_outcome: "Formal warning issued",
    warning_issued: "Verbal warning",
    warning_live_until: "2027-03-29",
    manager_conducting: "Phil Davies",
  });
  assert.deepEqual(facts, [
    "Meeting: Stage 1",
    "Date of the meeting: 2026-09-29",
    "The employee's explanation: Two colds.",
    "Outcome of the meeting: Formal warning issued",
    "Warning or dismissal: Verbal warning",
    "Warning remains live until: 2027-03-29",
  ]);
  assert.deepEqual(outcomeFacts(null), []);
});

test("buildOutcomePrompt says what the stage could lead to without making it the outcome", () => {
  const p = buildOutcomePrompt({ stage: 2, stageAction: "Written warning", facts: ["Outcome of the meeting: No further action"] });
  assert.match(p, /^This was a Stage 2 absence management meeting\./);
  assert.match(p, /That is the most it could lead to, not what was decided\./);
  assert.match(p, /- Outcome of the meeting: No further action/);
  const q = buildOutcomePrompt({ stage: null, stageAction: null, facts: [] });
  assert.match(q, /formal absence management meeting\.\n\nThe meeting record:\n- nothing recorded$/);
});

test("the instructions forbid inventing, appeals and sign offs", () => {
  assert.match(OUTCOME_SYSTEM, /Never add a fact/);
  assert.match(OUTCOME_SYSTEM, /right of appeal/);
  assert.match(OUTCOME_SYSTEM, /No dashes/);
});

test("cleanOutcomeBody strips markdown, bullets and dashes and keeps paragraphs", () => {
  const raw = "```\n**At the meeting** we talked — briefly.\n\n\n- You agreed to call in.\n## Outcome\nNo further action.\n```";
  assert.equal(cleanOutcomeBody(raw), "At the meeting we talked, briefly.\n\nYou agreed to call in.\nOutcome\nNo further action.");
});

test("normaliseApprovedBody trims and keeps the spacing the manager added", () => {
  assert.equal(normaliseApprovedBody("  a\r\n\r\n\r\n\r\nb  "), "a\n\n\n\nb");
  assert.equal(normaliseApprovedBody("a" + "\n".repeat(12) + "b"), "a\n\n\n\n\nb");
  assert.equal(normaliseApprovedBody(undefined), "");
});

test("slashDate turns an ISO date round", () => {
  assert.equal(slashDate("2026-09-29"), "29/09/2026");
  assert.equal(slashDate(null), "");
});

test("letterParagraphs merges the drafted middle into the company wording", () => {
  const paras = letterParagraphs("{{recipient_name}},\n\n{{outcome_body}}\n\nYours sincerely,\n{{company_name}}", {
    recipient_name: "Jane",
    outcome_body: "First.\n\nSecond.",
    company_name: "Acme",
  });
  assert.deepEqual(paras, ["Jane,", "First.", "Second.", "Yours sincerely,\nAcme"]);
});

test("an extra blank line is kept as a space in the letter", () => {
  assert.deepEqual(letterParagraphs("A.\n\n\n\nB.", {}), ["A.", "", "B."]);
  assert.deepEqual(letterParagraphs("\n\nA.\nline two\n\n\n\n", {}), ["A.\nline two"]);
});
