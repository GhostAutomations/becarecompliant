import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caseRegulator,
  categoryLabel,
  eventTypeLabel,
  orNotRecorded,
  regulatorNotifyHint,
  regulatorShortName,
  riddorDateError,
  yesNoLabel,
} from "./case-display.ts";
import { categoryOtherFrom } from "./report-answers.ts";

test("the case names only its branch's regulator, else the company's", () => {
  assert.equal(caseRegulator("ciw", "cqc"), "ciw");
  assert.equal(caseRegulator("cqc", "ciw"), "cqc");
  assert.equal(caseRegulator(null, "ciw"), "ciw");
  assert.equal(caseRegulator("", "CQC"), "cqc");
  assert.equal(caseRegulator(null, null), null);
  assert.equal(regulatorShortName("ciw"), "CIW");
  assert.equal(regulatorShortName(null), "the regulator");
});

test("the hint names one regulator, never both", () => {
  for (const code of ["ciw", "cqc", null] as const) {
    const hint = regulatorNotifyHint(code);
    assert.ok(!(hint.includes("CIW") && hint.includes("CQC")), hint);
  }
  assert.equal(regulatorNotifyHint("ciw"), "CIW Regulation 60.");
  assert.equal(regulatorNotifyHint("cqc"), "CQC Regulation 18.");
});

test("Other with words reads Other: words; without words, plain Other", () => {
  assert.equal(categoryLabel("Other", "Lift breakdown"), "Other: Lift breakdown");
  assert.equal(categoryLabel("Other", "  "), "Other");
  assert.equal(categoryLabel("Other", null), "Other");
  assert.equal(categoryLabel("Fall", "ignored"), "Fall");
  assert.equal(categoryLabel("", null), "Not recorded");
});

test("an old case with no type of event says Not recorded", () => {
  assert.equal(eventTypeLabel(null), "Not recorded");
  assert.equal(eventTypeLabel("near_miss"), "Near miss");
  assert.equal(eventTypeLabel("dangerous_occurrence"), "Dangerous occurrence");
  assert.equal(orNotRecorded(""), "Not recorded");
  assert.equal(orNotRecorded("x"), "x");
  assert.equal(yesNoLabel(null), "Not recorded");
  assert.equal(yesNoLabel(false), "No");
  assert.equal(yesNoLabel(true), "Yes");
});

test("a RIDDOR date in the future or before the incident is refused", () => {
  const today = "2026-10-14";
  assert.equal(riddorDateError(null, "2026-10-01", today), null);
  assert.equal(riddorDateError("2026-10-14", "2026-10-01", today), null);
  assert.equal(riddorDateError("2026-10-01", "2026-10-01", today), null);
  assert.match(riddorDateError("2026-10-15", "2026-10-01", today) ?? "", /future/);
  assert.match(riddorDateError("2026-09-30", "2026-10-01", today) ?? "", /before/);
  // Leap day and a month end compare as plain dates.
  assert.equal(riddorDateError("2028-02-29", "2028-02-28", "2028-03-01"), null);
});

test("the Other words are read from the question for the chosen type only", () => {
  assert.equal(
    categoryOtherFrom({ event_type: "near_miss", category_near_miss: "Other", category_near_miss_other: " Lift " }),
    "Lift",
  );
  // Another type's words are not the answer.
  assert.equal(
    categoryOtherFrom({ event_type: "accident", category_accident: "Other", category_near_miss_other: "Lift" }),
    null,
  );
  // Not Other: no words kept.
  assert.equal(
    categoryOtherFrom({ event_type: "accident", category_accident: "Fall", category_accident_other: "Lift" }),
    null,
  );
});
