import { test } from "node:test";
import assert from "node:assert/strict";
import { competitorLabel, leavingTakesEffectNow, parseLeaving, reasonLabel } from "./leaving.ts";

const full: Record<string, string> = {
  leaving_date: "2026-09-20",
  reason: "resigned",
  reason_other: "",
  re_employ: "yes",
  competitor: "no",
  competitor_name: "",
  score_attitude: "8",
  score_attendance: "7",
  score_lateness: "9",
  score_professionalism: "8",
  score_privacy: "10",
  score_teamwork: "6",
};
const get = (over: Record<string, string> = {}) => (name: string) => ({ ...full, ...over })[name];

test("a full set of answers is accepted", () => {
  const r = parseLeaving(get(), { startDate: "2025-01-01" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.re_employ, true);
    assert.equal(r.value.score_privacy, 10);
    assert.equal(r.value.reason_other, null);
    assert.equal(r.value.competitor_name, null);
  }
});

test("every answer is required", () => {
  for (const key of Object.keys(full)) {
    if (key === "reason_other" || key === "competitor_name") continue;
    const r = parseLeaving(get({ [key]: "" }), { startDate: null });
    assert.equal(r.ok, false, key);
  }
});

test("Other needs its reason, a competitor needs its name", () => {
  assert.match((parseLeaving(get({ reason: "other" }), { startDate: null }) as { error: string }).error, /other reason/);
  const ok = parseLeaving(get({ reason: "other", reason_other: "Moved away" }), { startDate: null });
  assert.equal(ok.ok, true);
  assert.match((parseLeaving(get({ competitor: "yes" }), { startDate: null }) as { error: string }).error, /competitor/);
  const named = parseLeaving(get({ competitor: "yes", competitor_name: "Acme Care" }), { startDate: null });
  assert.equal(named.ok && named.value.competitor_name, "Acme Care");
});

test("scores are whole numbers from 1 to 10", () => {
  for (const bad of ["0", "11", "7.5", "x", "-1"]) {
    assert.equal(parseLeaving(get({ score_teamwork: bad }), { startDate: null }).ok, false, bad);
  }
  assert.equal(parseLeaving(get({ score_teamwork: "1" }), { startDate: null }).ok, true);
  assert.equal(parseLeaving(get({ score_teamwork: "10" }), { startDate: null }).ok, true);
});

test("the leaving date: real, and not before they started; future is allowed", () => {
  assert.equal(parseLeaving(get({ leaving_date: "2026-02-30" }), { startDate: null }).ok, false);
  assert.equal(parseLeaving(get({ leaving_date: "2024-12-31" }), { startDate: "2025-01-01" }).ok, false);
  assert.equal(parseLeaving(get({ leaving_date: "2025-01-01" }), { startDate: "2025-01-01" }).ok, true);
  assert.equal(parseLeaving(get({ leaving_date: "2027-03-01" }), { startDate: "2025-01-01" }).ok, true);
});

test("they stay active until the end of their leaving day", () => {
  assert.equal(leavingTakesEffectNow("2026-09-22", "2026-09-23"), true);
  assert.equal(leavingTakesEffectNow("2026-09-23", "2026-09-23"), false);
  assert.equal(leavingTakesEffectNow("2026-10-01", "2026-09-23"), false);
});

test("labels", () => {
  assert.equal(reasonLabel("end_of_contract", null), "End of contract");
  assert.equal(reasonLabel("other", "Moved away"), "Other: Moved away");
  assert.equal(competitorLabel("yes", "Acme Care"), "Yes, Acme Care");
  assert.equal(competitorLabel("unknown", null), "Don't know");
});
