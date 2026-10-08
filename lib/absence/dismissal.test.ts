import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import { dismissalAnswersProblem } from "./dismissal.ts";

test("a dismissal needs the last day of employment and the notice", () => {
  assert.match(dismissalAnswersProblem({ meeting_outcome: "Dismissal" }) ?? "", /last day/i);
  assert.match(
    dismissalAnswersProblem({ meeting_outcome: "Dismissal", last_day_of_employment: "2026-10-30" }) ?? "",
    /notice/i,
  );
  assert.equal(
    dismissalAnswersProblem({ meeting_outcome: "Dismissal", last_day_of_employment: "2026-10-30", dismissal_notice: "Paid in lieu of notice" }),
    null,
  );
});

test("Dismissal under Warning or dismissal alone is refused, other outcomes are untouched", () => {
  assert.match(dismissalAnswersProblem({ meeting_outcome: "Formal warning issued", warning_issued: "Dismissal" }) ?? "", /Outcome of the meeting/);
  assert.equal(dismissalAnswersProblem({ meeting_outcome: "Formal warning issued", warning_issued: "Written warning" }), null);
  assert.equal(dismissalAnswersProblem({ meeting_outcome: "No further action" }), null);
  assert.match(
    dismissalAnswersProblem({ meeting_outcome: "Dismissal", warning_issued: "Written warning", last_day_of_employment: "2026-10-30", dismissal_notice: "Worked notice" }) ?? "",
    /should be Dismissal/,
  );
});

/* The outcome letter is told the dismissal details, with dates written as the letter writes them. */
import { fullDate, outcomeFacts } from "./outcome-letter.ts";
import { discussedAbsences, stageThresholds } from "./meeting-questions.ts";

test("dates go to the letter as 1st October 2026", () => {
  assert.equal(fullDate("2026-10-01"), "1st October 2026");
  assert.equal(fullDate("2026-10-12"), "12th October 2026");
  assert.equal(fullDate("2026-10-22"), "22nd October 2026");
  assert.equal(fullDate("not a date"), "not a date");
});

test("a dismissal's last day and notice reach the letter facts, and no live until date", () => {
  const facts = outcomeFacts({
    meeting_outcome: "Dismissal",
    warning_issued: "Dismissal",
    warning_live_until: "2027-01-01",
    last_day_of_employment: "2026-10-30",
    dismissal_notice: "Paid in lieu of notice",
    date_of_meeting: "2026-10-07",
  });
  assert.ok(facts.includes("Last day of employment: 30th October 2026"));
  assert.ok(facts.includes("Notice: Paid in lieu of notice"));
  assert.ok(facts.includes("Date of the meeting: 7th October 2026"));
  assert.ok(!facts.some((f) => f.startsWith("Warning remains live until")));
});

test("each stage's invitation lists only its absences (the four stage test)", () => {
  const t = stageThresholds("stages", [
    { stage: 1, occasions: 3 },
    { stage: 2, occasions: 4 },
    { stage: 3, occasions: 5 },
    { stage: 4, occasions: 6 },
  ]);
  const six = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(discussedAbsences(six, 1, t).map((x) => x.e), [1, 2, 3]);
  assert.deepEqual(discussedAbsences(six, 2, t).map((x) => x.e), [4]);
  assert.deepEqual(discussedAbsences(six, 4, t).map((x) => x.e), [6]);
  assert.deepEqual(stageThresholds("bradford", [{ stage: 1, occasions: 3 }]), []);
});
