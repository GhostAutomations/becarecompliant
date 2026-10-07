import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME_SYSTEM,
  buildOutcomePrompt,
  cleanOutcomeBody,
  absencesBlock,
  joinLetterParagraphs,
  letterParagraphs,
  stageAfterMeeting,
  stageFacts,
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
  assert.deepEqual(letterParagraphs("A.\n\nB.", {}), ["A.", "B."]);
  assert.deepEqual(letterParagraphs("A.\n\n\nB.", {}), ["A.", "", "B."]);
  assert.deepEqual(letterParagraphs("A.\n\n\n\nB.", {}), ["A.", "", "", "B."]);
  assert.deepEqual(letterParagraphs("\n\nA.\nline two\n\n\n\n", {}), ["A.\nline two"]);
});

test("joinLetterParagraphs is the reverse of letterParagraphs", () => {
  for (const text of ["A.", "A.\n\nB.", "A.\n\n\nB.", "A.\nline\n\n\n\nB.\n\nC."]) {
    assert.equal(joinLetterParagraphs(letterParagraphs(text, {})), text);
  }
});

test("stage facts: why this stage, and what a further absence could lead to", () => {
  const thresholds = [
    { stage: 1, occasions: 3, action: "Verbal warning" },
    { stage: 2, occasions: 4, action: "Written warning" },
    { stage: 3, occasions: 5, action: "Final written warning" },
    { stage: 4, occasions: 6, action: "Dismissal" },
  ];
  assert.deepEqual(stageFacts({ stage: 2, thresholds, windowWords: "6 months" }), [
    "Why this stage: Stage 2 is reached at 4 absences within 6 months",
    "If attendance does not improve: a further absence may lead to a Stage 3 meeting, which could result in up to and including a final written warning",
  ]);
  assert.equal(stageFacts({ stage: 4, thresholds, windowWords: "6 months" }).length, 1);
  assert.deepEqual(stageFacts({ stage: null, thresholds, windowWords: "6 months" }), []);
});

test("absences block lists each absence like the invitation, discounted ones marked and explained", () => {
  const a = { line: "22nd September 2026: Childcare, 1 day", startDate: "2026-09-22", when: "22nd September 2026" };
  const b = { line: "3rd August 2026: Car, 1 day", startDate: "2026-08-03", when: "3rd August 2026" };
  assert.equal(absencesBlock([a]), "The meeting covered the following absence:\n\u2022 22nd September 2026: Childcare, 1 day");
  assert.equal(
    absencesBlock([b, a], { dates: ["2026-08-03"], whens: ["3rd August 2026"], reason: "Agreed at the Stage 2 meeting held on 20/10/2026." }),
    "The meeting covered the following 2 absences:\n\u2022 3rd August 2026: Car, 1 day (discounted at this meeting)\n\u2022 22nd September 2026: Childcare, 1 day\n\nThe absence on 3rd August 2026 was discounted at this meeting and no longer counts towards your attendance: Agreed at the Stage 2 meeting held on 20/10/2026.",
  );
  assert.equal(absencesBlock([]), "");
});

test("stage after a meeting: No further action with absences discounted stays where they were", () => {
  const thresholds = [
    { stage: 1, occasions: 3 },
    { stage: 2, occasions: 4 },
    { stage: 3, occasions: 5 },
  ];
  // Stage 2 meeting, one of four discounted, NFA: back to three, Stage 1 held before: stays Stage 1.
  assert.equal(stageAfterMeeting({ stage: 2, outcome: "No further action", remaining: 3, priorHeld: 1, thresholds }), 1);
  // A warning keeps the meeting's stage whatever was discounted.
  assert.equal(stageAfterMeeting({ stage: 2, outcome: "Formal warning issued", remaining: 3, priorHeld: 1, thresholds }), 2);
  // NFA but still at the trigger: the meeting's stage.
  assert.equal(stageAfterMeeting({ stage: 2, outcome: "No further action", remaining: 4, priorHeld: 1, thresholds }), 2);
  // NFA below every trigger with no earlier meeting: no stage.
  assert.equal(stageAfterMeeting({ stage: 1, outcome: "No further action", remaining: 2, priorHeld: null, thresholds }), null);
});

test("what happens next follows the stage after the meeting", () => {
  const thresholds = [
    { stage: 1, occasions: 3, action: "Verbal warning" },
    { stage: 2, occasions: 4, action: "Written warning" },
    { stage: 3, occasions: 5, action: "Final written warning" },
  ];
  const f = stageFacts({ stage: 2, thresholds, windowWords: "6 months", stageAfter: 1, label: (n) => `Stage ${n} disciplinary hearing` });
  assert.ok(f.some((x) => x.includes("REMAINS AT STAGE 1")));
  assert.ok(f.some((x) => x.includes("may lead to a Stage 2 disciplinary hearing, which could result in up to and including a written warning")));
  assert.ok(!f.some((x) => x.includes("Stage 3")));
});

test("a warning date left behind is not used when the warning is None", () => {
  const facts = outcomeFacts({ meeting_outcome: "No further action", warning_issued: "None", warning_live_until: "2027-02-17" });
  assert.ok(!facts.some((f) => f.includes("2027-02-17")));
  const withWarning = outcomeFacts({ warning_issued: "Written warning", warning_live_until: "2027-02-17" });
  assert.ok(withWarning.some((f) => f.includes("2027-02-17")));
});

test("the reason for no further action goes to the letter only with that outcome", () => {
  assert.ok(
    outcomeFacts({ meeting_outcome: "No further action", nfa_reason: "Emergency with a dependant" }).some((f) =>
      f.startsWith("Reason for no further action: Emergency"),
    ),
  );
  assert.ok(!outcomeFacts({ meeting_outcome: "Formal warning issued", nfa_reason: "left over" }).some((f) => f.includes("left over")));
});

test("the reason for no further action goes to the letter only with that outcome", () => {
  assert.ok(
    outcomeFacts({ meeting_outcome: "No further action", nfa_reason: "Emergency with a dependant" }).some((f) =>
      f.startsWith("Reason for no further action: Emergency"),
    ),
  );
  assert.ok(!outcomeFacts({ meeting_outcome: "Formal warning issued", nfa_reason: "left over" }).some((f) => f.includes("left over")));
});

test("the stage line only mentions discounts when some were made", () => {
  const thresholds = [
    { stage: 1, occasions: 3, action: "Verbal warning" },
    { stage: 2, occasions: 4, action: "Written warning" },
  ];
  const none = stageFacts({ stage: 2, thresholds, windowWords: "6 months", stageAfter: 1, discountedAtMeeting: 0 });
  assert.ok(none.some((x) => x.includes("REMAINS AT STAGE 1")));
  assert.ok(!none.some((x) => /discount/i.test(x)));
  const some = stageFacts({ stage: 2, thresholds, windowWords: "6 months", stageAfter: 1, discountedAtMeeting: 1 });
  assert.ok(some.some((x) => x.includes("discounted at this meeting")));
});
