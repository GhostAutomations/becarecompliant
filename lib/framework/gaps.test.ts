import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafetyCheck, assessGap, gapInHand, metricGap, isLateReason, lateReasonLabel } from "./gaps.ts";

const base = { dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: [] as string[], updates: [], away: [] };
const u = (on: string, reason: string | null = null, dbs: string | null = null) => ({ on, by: "Bev", reason: reason as never, dbsSubmittedOn: dbs });

test("safety checks by key and by name", () => {
  assert.equal(isSafetyCheck("competency", "Medication Competency"), true);
  assert.equal(isSafetyCheck("supervision", "Supervision"), false);
  assert.equal(isSafetyCheck("custom_1", "MAR Audit"), true);
  assert.equal(isSafetyCheck("custom_2", "Risk Assessment Review"), true);
  assert.equal(isSafetyCheck(null, "DBS renewal"), true);
  assert.equal(isSafetyCheck("spot_check", "Spot Check"), false);
  assert.equal(isSafetyCheck("x", "Smart goals review"), false);
});

test("not a safety gap: Area for Improvement likely, with or without an action", () => {
  assert.deepEqual(assessGap({ ...base, safety: false }), { action: null, risk: "afi_likely" });
  assert.equal(assessGap({ ...base, safety: false, updates: [u("2026-09-10")] }).risk, "afi_likely");
});

test("safety gap with nothing in place is a Priority Action Notice risk", () => {
  assert.deepEqual(assessGap({ ...base, safety: true }), { action: null, risk: "pan_risk" });
});

test("a booking still to happen counts; a past one does not", () => {
  const r = assessGap({ ...base, safety: true, bookings: ["2026-10-05", "2026-10-03"] });
  assert.deepEqual(r, { action: { kind: "booked", on: "2026-10-03" }, risk: "judgement" });
  assert.equal(assessGap({ ...base, safety: true, bookings: ["2026-09-20"] }).risk, "pan_risk");
  assert.equal(assessGap({ ...base, safety: true, bookings: ["2026-10-02"] }).risk, "judgement");
});

test("a note with no reason, or Other, leaves a safety gap red but is shown", () => {
  const r = assessGap({ ...base, safety: true, updates: [u("2026-09-10")] });
  assert.equal(r.risk, "pan_risk");
  assert.equal(r.action?.kind, "update");
  assert.equal(assessGap({ ...base, safety: true, updates: [u("2026-09-10", "other")] }).risk, "pan_risk");
});

test("a recognised reason makes a safety gap the inspector's judgement", () => {
  for (const reason of ["holiday", "sickness", "hospital", "nok_unavailable", "booked"]) {
    assert.equal(assessGap({ ...base, safety: true, updates: [u("2026-09-10", reason)] }).risk, "judgement", reason);
  }
});

test("only notes on or after the due date count; the best one is shown", () => {
  assert.equal(assessGap({ ...base, safety: true, updates: [u("2026-08-30", "holiday")] }).action, null);
  const r = assessGap({ ...base, safety: true, updates: [u("2026-09-20"), u("2026-09-10", "sickness")] });
  assert.equal(r.risk, "judgement");
  assert.equal(r.action && r.action.kind === "update" ? r.action.reason : null, "sickness");
});

test("holiday or absence covering the due date is spotted", () => {
  const r = assessGap({ ...base, safety: true, away: [{ from: "2026-08-28", to: "2026-09-05", what: "holiday" }] });
  assert.equal(r.risk, "judgement");
  assert.equal(r.action?.kind, "away");
  assert.equal(assessGap({ ...base, safety: true, away: [{ from: "2026-09-02", to: "2026-09-05", what: "absence" }] }).risk, "pan_risk");
});

test("DBS: an application at least 8 weeks before the renewal date counts, later does not (S6)", () => {
  const dbs = { ...base, safety: true, tracker: "dbs_renewal" as const, dueDate: "2026-09-22" };
  // 8 weeks before 22 Sept is 28 July.
  assert.equal(assessGap({ ...dbs, updates: [u("2026-10-02", null, "2026-07-28")] }).risk, "judgement");
  assert.equal(assessGap({ ...dbs, updates: [u("2026-10-02", null, "2026-07-29")] }).risk, "pan_risk");
  assert.equal(assessGap({ ...dbs, updates: [u("2026-10-02", "holiday")] }).risk, "pan_risk");
  assert.equal(assessGap({ ...dbs, updates: [u("2026-10-02")] }).risk, "pan_risk");
});

test("in hand means an action that is not still red", () => {
  assert.equal(gapInHand({ action: null, risk: "afi_likely" }), false);
  assert.equal(gapInHand({ action: { kind: "booked", on: "2026-10-03" }, risk: "judgement" }), true);
  assert.equal(gapInHand({ action: { kind: "update", on: "2026-10-01", by: "B", reason: null, dbsSubmittedOn: null }, risk: "pan_risk" }), false);
  assert.equal(gapInHand({ action: { kind: "update", on: "2026-10-01", by: "B", reason: null, dbsSubmittedOn: null }, risk: "afi_likely" }), true);
  assert.equal(gapInHand({ action: { kind: "booked", on: "2026-10-03" }, risk: null }), true);
});

test("metric gaps sit below 85, safeguarding under 50 is a safety gap", () => {
  assert.equal(metricGap("Mandatory training", 85), null);
  assert.equal(metricGap("Mandatory training", null), null);
  assert.equal(metricGap("Mandatory training", 84)?.risk, "afi_likely");
  assert.equal(metricGap("Safeguarding training", 60)?.risk, "afi_likely");
  assert.equal(metricGap("Safeguarding training", 49)?.risk, "pan_risk");
});

test("late reasons", () => {
  assert.equal(isLateReason("holiday"), true);
  assert.equal(isLateReason("nope"), false);
  assert.equal(lateReasonLabel("nok_unavailable"), "Next of kin or attorney unavailable");
});

test("the action in words", async () => {
  const { actionText } = await import("./gaps.ts");
  const f = (d: string) => d;
  assert.equal(actionText(null, f), null);
  assert.equal(actionText({ kind: "booked", on: "2026-10-05" }, f), "Booked 2026-10-05");
  assert.equal(actionText({ kind: "away", from: "2026-09-01", to: "2026-09-05", what: "holiday" }, f), "On holiday 2026-09-01 to 2026-09-05, when it fell due");
  assert.equal(
    actionText({ kind: "update", on: "2026-10-02", by: "Bev", reason: "sickness", dbsSubmittedOn: null }, f),
    "Action noted 2026-10-02 by Bev: staff member off sick or absent",
  );
  assert.equal(
    actionText({ kind: "update", on: "2026-10-02", by: "Bev", reason: null, dbsSubmittedOn: "2026-07-01" }, f),
    "Action noted 2026-10-02 by Bev, DBS applied 2026-07-01",
  );
});
