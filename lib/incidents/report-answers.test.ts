import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryFrom,
  officeQuestionsMissing,
  withoutOfficeAnswers,
  withoutOfficeQuestions,
  yesNo,
} from "./report-answers.ts";

test("the kind is read from the question for the chosen type, never another type's", () => {
  assert.equal(categoryFrom({ event_type: "accident", category_accident: "Fall" }), "Fall");
  // A kind left over from a type that was changed is not the answer.
  assert.equal(
    categoryFrom({ event_type: "incident", category_accident: "Fall", category_incident: "Medication error" }),
    "Medication error",
  );
  assert.equal(categoryFrom({ event_type: "incident", category_accident: "Fall" }), null);
});

test("a report on the first version of the form still gives its kind", () => {
  assert.equal(categoryFrom({ event_type: "accident", category: "Fall" }), "Fall");
  assert.equal(categoryFrom({}), null);
});

test("the team never answers the office's questions", () => {
  const schema = {
    sections: [
      { id: "event", title: "The event", fields: [{ key: "description", type: "long_text" as const, label: "What" }] },
      {
        id: "office",
        title: "For the office",
        fields: [
          { key: "notifiable", type: "yes_no" as const, label: "N" },
          { key: "safeguarding", type: "yes_no" as const, label: "S" },
        ],
      },
    ],
  };
  const team = withoutOfficeQuestions(schema);
  assert.deepEqual(team.sections.map((s) => s.id), ["event"]);
  assert.deepEqual(withoutOfficeAnswers({ description: "x", notifiable: "yes", safeguarding: "no" }), {
    description: "x",
  });
});

test("the office has to answer both before filing", () => {
  assert.equal(officeQuestionsMissing({}).length, 2);
  assert.equal(officeQuestionsMissing({ notifiable: "no", safeguarding: "yes" }).length, 0);
  assert.equal(yesNo({ a: "Yes" }, "a"), true);
  assert.equal(yesNo({ a: "" }, "a"), null);
});
