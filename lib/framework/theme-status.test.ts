import { test } from "node:test";
import assert from "node:assert/strict";
import { themeReason, themeStatus, type ThemeInputs } from "./theme-status.ts";

const base: ThemeInputs = {
  overdue: 0, dueSoon: 0, total: 10, onTimePct: 100, metrics: [], priorityOpen: 0, improvementOpen: 0,
};

test("a Priority Action Notice is Action needed whatever else is true (CIW's own rule)", () => {
  const t = { ...base, priorityOpen: 1 };
  assert.equal(themeStatus(t), "red");
  assert.equal(themeReason(t, "CIW"), "CIW Priority Action Notice open");
});

test("an Area for Improvement raises a theme to Attention and no further", () => {
  const t = { ...base, improvementOpen: 1 };
  assert.equal(themeStatus(t), "amber");
  assert.equal(themeReason(t, "CIW"), "1 Area for Improvement open");
});

test("overdue work is the reason before a weak percentage", () => {
  const t = { ...base, overdue: 1, onTimePct: 68 };
  assert.equal(themeStatus(t), "red");
  assert.equal(themeReason(t, "CIW"), "1 check overdue");
});

test("the weakest percentage is named when nothing is overdue", () => {
  const t = { ...base, onTimePct: 90, metrics: [{ label: "Mandatory training", pct: 72 }] };
  assert.equal(themeStatus(t), "amber");
  assert.equal(themeReason(t, "CIW"), "72% mandatory training");
});

test("everything in hand reads Up to date", () => {
  assert.equal(themeStatus(base), "green");
  assert.equal(themeReason(base, "CIW"), "Up to date");
});

test("an overdue complaint or incident is named, and makes the theme Action needed", () => {
  const t = {
    ...base,
    overdue: 2,
    caseOverdue: [{ singular: "complaint", plural: "complaints", count: 1 }],
  };
  assert.equal(themeStatus(t), "red");
  assert.equal(themeReason(t, "CIW"), "2 checks, 1 complaint overdue");
});
