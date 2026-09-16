import test from "node:test";
import assert from "node:assert/strict";
import { REG73_SECTIONS, REG73_AI_FIELDS, REG73_ACTION_FIELDS, buildInitialData } from "./spec.ts";
import type { Reg73Prefill } from "./prefill.ts";

const ALL = REG73_SECTIONS.flatMap((s) => s.fields);
const keys = ALL.map((f) => f.key);
const has = (k: string) => keys.includes(k);

function prefill(over: Partial<Reg73Prefill> = {}): Reg73Prefill {
  return {
    branchId: "b1",
    branchName: "Cardiff Branch",
    generatedAt: "2026-09-16",
    spotCheckOverdue: 3,
    supervisionOverdue: 1,
    overdueByCheck: [],
    pqs: {
      mandatoryTraining: 90,
      safeguarding: 100,
      scwRegistration: 80,
      supervisionOnTime: 70,
      carePlanReviewOnTime: 60,
      customerSatisfaction: null,
      personalOutcomes: null,
    },
    complaints: { total: 0, byType: [], recent: [] },
    staffing: { total: 12, roles: [] },
    previousVisit: null,
    ...over,
  };
}

test("every field key is unique", () => {
  assert.equal(new Set(keys).size, keys.length);
});

/*
 * THE REGRESSION THIS FILE EXISTS FOR. The paper form is modelled on the plan, do and review
 * cycle: each review question is followed by what the plan is, who does what by when, and when
 * it gets checked. An earlier version of this spec kept the questions and dropped all fourteen
 * follow up boxes, so an RI could answer No and the report had nowhere to say what happens next.
 */
test("every review question carries its plan, do and review boxes", () => {
  for (const prefix of ["staffing_structure", "key_info", "systems", "workforce"]) {
    assert.ok(has(`${prefix}_plan`), `${prefix}_plan missing`);
    assert.ok(has(`${prefix}_do`), `${prefix}_do missing`);
    assert.ok(has(`${prefix}_review`), `${prefix}_review missing`);
  }
  // Premises is asked as do and review only, which is how the form asks it.
  assert.ok(has("premises_do"));
  assert.ok(has("premises_review"));
  assert.equal(has("premises_plan"), false);
});

test("the plan, do and review boxes are not AI drafted", () => {
  // Who does what by when is a management decision, not something to generate.
  for (const k of REG73_AI_FIELDS) {
    assert.equal(/_(do|review)$/.test(k), false, `${k} should not be an AI field`);
  }
  assert.deepEqual(REG73_AI_FIELDS, [
    "plan",
    "staff_feedback_quality",
    "staff_feedback_outcomes",
    "su_feedback_consistent",
    "su_feedback_outcomes",
  ]);
});

test("every action field is a real field on the form", () => {
  for (const f of REG73_ACTION_FIELDS) assert.ok(has(f.key), `${f.key} is not on the form`);
});

/*
 * The second regression. buildInitialData used to answer nine Yes/No questions "Yes" before the
 * RI had looked at anything, including whether they had reviewed service user files and the
 * safeguarding file. The RI then signs the report, so the software was pre-filling an
 * attestation. Only prev_actions_identified is derived, and that is read off the last report.
 */
test("no Yes/No question is answered for the RI", () => {
  const initial = buildInitialData(prefill(), "Jo Bloggs");
  const yesNo = ALL.filter((f) => f.type === "yesno").map((f) => f.key);
  for (const k of yesNo) {
    if (k === "prev_actions_identified") continue;
    assert.equal(initial[k], undefined, `${k} must start unanswered`);
  }
});

test("only what the site knows is pre-filled", () => {
  const initial = buildInitialData(prefill(), "Jo Bloggs");
  assert.equal(initial.ri_name, "Jo Bloggs");
  assert.equal(initial.start_date, "2026-09-16");
  assert.equal(initial.end_date, "2026-09-16");
  assert.match(initial.kpi_dashboard, /3/);
  assert.match(initial.kpi_dashboard, /none recorded/);
  // Service user feedback is what service users said, so it is never seeded with complaints.
  assert.equal(initial.su_feedback_consistent, undefined);
});

test("a first visit says so instead of leaving the box empty", () => {
  const initial = buildInitialData(prefill(), "Jo Bloggs");
  assert.equal(initial.prev_actions_identified, "No");
  assert.match(initial.prev_actions_status, /first recorded Regulation 73 visit/);
});

test("the previous visit's actions carry forward, box by box", () => {
  const initial = buildInitialData(
    prefill({
      previousVisit: {
        endDate: "2026-06-10",
        data: {
          staffing_structure_do: "Sam to recruit a senior by 30 June.",
          premises_do: "Display the insurance certificate.",
          branch_feedback: "Nothing to add.",
        },
      },
    }),
    "Jo Bloggs",
  );
  assert.equal(initial.prev_actions_identified, "Yes");
  assert.match(initial.prev_actions_status, /ended 2026-06-10/);
  assert.match(initial.prev_actions_status, /Sam to recruit a senior by 30 June/);
  assert.match(initial.prev_actions_status, /Display the insurance certificate/);
  // branch_feedback is not an action, so it does not come forward as one.
  assert.equal(/Nothing to add/.test(initial.prev_actions_status), false);
});

test("a previous visit that recorded nothing is answered No", () => {
  const initial = buildInitialData(
    prefill({ previousVisit: { endDate: "2026-06-10", data: { branch_feedback: "All fine." } } }),
    "Jo Bloggs",
  );
  assert.equal(initial.prev_actions_identified, "No");
  assert.match(initial.prev_actions_status, /recorded no actions/);
});

test("complaints are reported on the data box, not as service user feedback", () => {
  const initial = buildInitialData(
    prefill({ complaints: { total: 2, byType: [{ type: "Care delivery", count: 2 }], recent: [] } }),
    "Jo Bloggs",
  );
  assert.match(initial.kpi_dashboard, /Complaints in the last 3 months: 2 \(Care delivery: 2\)/);
});
