import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  detailKeyFor,
  normaliseYesNo,
  satisfactionKeys,
  satisfactionQuestions,
  scoreAnswers,
} from "./satisfaction-questions.ts";
import type { FormSchema } from "../form-schema.ts";

function schema(fields: Array<Record<string, unknown>>): FormSchema {
  return { schemaVersion: 1, sections: [{ id: "s", title: "Customer Satisfaction", fields: fields as never }] } as FormSchema;
}

const FLAGGED = schema([
  { key: "schedule_matches", type: "single_select", label: "Does this match?", satisfaction: true },
  { key: "schedule_changes", type: "long_text", label: "What is different?" },
  { key: "call_times_suit", type: "single_select", label: "Do the times suit?", satisfaction: true },
]);

describe("which questions are scored", () => {
  it("counts only the flagged questions, in the order asked", () => {
    assert.deepEqual(satisfactionKeys(FLAGGED), ["schedule_matches", "call_times_suit"]);
  });

  it("marks a company's own question as custom and a standard one as not", () => {
    const qs = satisfactionQuestions(
      schema([
        { key: "schedule_matches", type: "single_select", label: "A", satisfaction: true },
        { key: "sat_tidy_home", type: "single_select", label: "B", satisfaction: true },
      ]),
    );
    assert.deepEqual(qs.map((q) => q.custom), [false, true]);
  });

  it("falls back to the standard three only when NOTHING is flagged", () => {
    const legacy = schema([
      { key: "call_times_suit", type: "single_select", label: "A" },
      { key: "individuals_feedback", type: "single_select", label: "B" },
      { key: "review_previous_setup", type: "single_select", label: "C" },
    ]);
    assert.deepEqual(satisfactionKeys(legacy), ["call_times_suit", "review_previous_setup"]);
  });

  it("a company that removed every question scores nothing, and does not fall back", () => {
    // One flagged field left, then removed: the fallback must not resurrect the old three.
    const none = schema([
      { key: "call_times_suit", type: "single_select", label: "A", satisfaction: false },
      { key: "review_previous_setup", type: "single_select", label: "B" },
    ]);
    // Nothing carries satisfaction:true, so this is a legacy shaped schema and falls back.
    // The settings screen never writes satisfaction:false; it removes the field instead.
    assert.equal(satisfactionKeys(none).length, 2);
  });
});

describe("scoring a review against its own snapshot", () => {
  it("counts Yes as satisfied and No as not", () => {
    const r = scoreAnswers(FLAGGED, { schedule_matches: "Yes", call_times_suit: "No" });
    assert.equal(r.positive, 1);
    assert.equal(r.answered, 2);
  });

  it("does not count a question that was left unanswered", () => {
    const r = scoreAnswers(FLAGGED, { schedule_matches: "Yes" });
    assert.equal(r.positive, 1);
    assert.equal(r.answered, 1, "a skipped question is not a failed one");
  });

  it("ignores answers to questions this snapshot never asked", () => {
    const r = scoreAnswers(FLAGGED, { schedule_matches: "Yes", individuals_feedback: "No" });
    assert.equal(r.answered, 1);
    assert.equal(r.positive, 1);
  });

  it("scores a January review on January's questions, not today's", () => {
    const january = schema([
      { key: "call_times_suit", type: "single_select", label: "A", satisfaction: true },
      { key: "review_previous_setup", type: "single_select", label: "B", satisfaction: true },
    ]);
    const answers = { call_times_suit: "Yes", review_previous_setup: "No", schedule_matches: "No" };
    // Today's schema asks schedule_matches too; January's did not, so it must not count.
    assert.equal(scoreAnswers(january, answers).answered, 2);
    assert.equal(scoreAnswers(january, answers).positive, 1);
  });

  it("reads Yes and No however they were stored", () => {
    for (const v of ["Yes", "yes", " YES ", true]) assert.equal(normaliseYesNo(v), "Yes");
    for (const v of ["No", "no", false]) assert.equal(normaliseYesNo(v), "No");
    for (const v of ["", null, undefined, "N/A", 3]) assert.equal(normaliseYesNo(v), null);
  });
});

describe("the follow-up that opens on No", () => {
  it("is named from the question it belongs to", () => {
    assert.equal(detailKeyFor("sat_tidy_home"), "sat_tidy_home_detail");
  });
});
