import { test } from "node:test";
import assert from "node:assert/strict";
import { systemSettingLines } from "./system-settings.ts";

const stages = {
  method: "stages" as const,
  window: { value: 12, unit: "month" as const },
  thresholds: [
    { stage: 2, label: "Stage 2", occasions: 4, action: "Written warning" },
    { stage: 1, label: "Stage 1", occasions: 3, action: "Informal discussion" },
  ],
};

test("sickness absence carries the stages, in order, with their triggers", () => {
  const l = systemSettingLines("sickness_absence", { absence: stages, probation: null });
  assert.match(l[0], /stages.*rolling 12 months/);
  assert.match(l[1], /Stage 1 is reached at 3 separate absences.*an informal discussion/);
  assert.match(l[2], /Stage 2 is reached at 4 separate absences.*a written warning/);
});

test("Bradford carries the formula and the bands", () => {
  const l = systemSettingLines("sickness_absence", {
    absence: { method: "bradford", window: { value: 52, unit: "week" }, thresholds: [{ threshold: 200, label: "Stage 2", action: "Written warning" }, { threshold: 51, label: "Stage 1", action: "Informal discussion" }] },
    probation: null,
  });
  assert.match(l[0], /Bradford Factor over a rolling 52 weeks/);
  assert.match(l[1], /51 or more/);
  assert.match(l[2], /200 or more/);
});

test("probation carries the period; other policies carry nothing", () => {
  assert.match(systemSettingLines("probation", { absence: stages, probation: { value: 12, unit: "week" } })[0], /12 weeks/);
  assert.deepEqual(systemSettingLines("holiday_leave", { absence: stages, probation: { value: 3, unit: "month" } }), []);
});

test("one absence is singular, and a custom stage name is kept", () => {
  const l = systemSettingLines("sickness_absence", {
    absence: { method: "stages", window: { value: 6, unit: "month" }, thresholds: [{ stage: 1, label: "Stage 1", occasions: 1, action: "Verbal warning" }, { stage: 4, label: "Final review", occasions: 8, action: "Dismissal" }] },
    probation: null,
  });
  assert.equal(l[1], "Stage 1 is reached at 1 separate absence, and its outcome can be up to and including a verbal warning.");
  assert.equal(l[2], "Stage 4 (Final review) is reached at 8 separate absences, and its outcome can be up to and including dismissal.");
});
