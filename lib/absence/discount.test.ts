import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absenceCountState,
  canDiscountAbsences,
  countedAbsences,
  discountReasonProblem,
  meetingDiscountReason,
  windowStartIso,
} from "./discount.ts";

test("only Managers and above can discount", () => {
  for (const r of ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"]) {
    assert.equal(canDiscountAbsences(r), true, r);
  }
  for (const r of ["supervisor", "team_member", "staff", "on_call", "recruiter", "", null, undefined]) {
    assert.equal(canDiscountAbsences(r as string), false, String(r));
  }
});

test("a discount needs a reason", () => {
  assert.equal(discountReasonProblem(""), "Say why this absence is being discounted.");
  assert.equal(discountReasonProblem("  ok "), "Say why this absence is being discounted.");
  assert.equal(discountReasonProblem("Car broke down"), null);
});

test("the after meeting reason names the stage and date", () => {
  assert.equal(meetingDiscountReason(1, "2026-06-09"), "Discounted at the Stage 1 meeting held on 09/06/2026");
  assert.equal(meetingDiscountReason(null, null), "Discounted at the absence meeting");
});

test("the window starts where Postgres says it does", () => {
  assert.equal(windowStartIso("2026-09-24", { value: 6, unit: "month" }), "2026-03-24");
  assert.equal(windowStartIso("2026-08-31", { value: 6, unit: "month" }), "2026-02-28");
  assert.equal(windowStartIso("2028-08-31", { value: 6, unit: "month" }), "2028-02-29");
  assert.equal(windowStartIso("2026-01-15", { value: 12, unit: "month" }), "2025-01-15");
  assert.equal(windowStartIso("2026-03-01", { value: 52, unit: "week" }), "2025-03-02");
  assert.equal(windowStartIso("2026-03-01", { value: 1, unit: "day" }), "2026-02-28");
});

test("what counts: discounted and outside the window do not", () => {
  const opts = { windowStart: "2026-03-24" };
  const evs = [
    { id: "a", start_date: "2026-07-01", discounted_at: null },
    { id: "b", start_date: "2026-01-01", discounted_at: null },
    { id: "c", start_date: "2026-06-10", discounted_at: "2026-09-24T10:00:00Z" },
    { id: "d", start_date: "2026-03-24", discounted_at: null },
  ];
  assert.equal(absenceCountState(evs[1], opts), "outside_window");
  assert.equal(absenceCountState(evs[2], opts), "discounted");
  assert.equal(absenceCountState(evs[3], opts), "counted");
  assert.deepEqual(countedAbsences(evs, opts).map((e) => e.id), ["d", "a"]);
});
