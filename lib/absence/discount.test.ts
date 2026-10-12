import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absenceCountState,
  discountedAtMeeting,
  meetingDateInReason,
  canDiscountAbsences,
  countedAbsences,
  discountReasonProblem,
  meetingDiscountReason,
  windowStartIso,
} from "./discount.ts";

test("Managers and above, and Supervisors (2026-10-08), can discount", () => {
  for (const r of ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin", "supervisor"]) {
    assert.equal(canDiscountAbsences(r), true, r);
  }
  for (const r of ["team_member", "staff", "senior", "on_call", "recruiter", "", null, undefined]) {
    assert.equal(canDiscountAbsences(r as string), false, String(r));
  }
});

test("a discount needs a reason", () => {
  assert.equal(discountReasonProblem(""), "Say why this absence is being discounted.");
  assert.equal(discountReasonProblem("  ok "), "Say why this absence is being discounted.");
  assert.equal(discountReasonProblem("Car broke down"), null);
});

test("the after meeting reason names the stage and date", () => {
  assert.equal(meetingDiscountReason(1, "2026-06-09"), "Agreed at the Stage 1 meeting held on 09/06/2026");
  assert.equal(meetingDiscountReason(null, null), "Agreed at the absence meeting");
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

test("a discount belongs to the meeting its reason names, else to the meeting before the next one", () => {
  const ev = [
    { id: "at meeting", discounted_at: "2026-10-12T13:29:20Z", discount_reason: "Agreed at the Stage 1 meeting held on 12/10/2026" },
    { id: "back entered", discounted_at: "2026-10-25T00:04:00Z", discount_reason: "Disallowed at the Stage 1 meeting held on 12th October 2026" },
    { id: "named other meeting", discounted_at: "2026-10-13T09:00:00Z", discount_reason: "Agreed at the Stage 2 meeting held on 13/10/2026" },
    { id: "by hand, no date", discounted_at: "2026-10-14T09:00:00Z", discount_reason: "Hospital letter seen" },
    { id: "by hand after next meeting", discounted_at: "2026-11-02T09:00:00Z", discount_reason: "Hospital letter seen" },
    { id: "earlier", discounted_at: "2026-10-01T09:00:00Z", discount_reason: null },
    { id: "never", discounted_at: null, discount_reason: null },
  ];
  assert.deepEqual(
    discountedAtMeeting(ev, "2026-10-12", "2026-11-01").map((e) => e.id),
    ["at meeting", "back entered", "by hand, no date"],
  );
  assert.deepEqual(discountedAtMeeting(ev, null), []);
  assert.equal(meetingDateInReason("Disallowed at the Stage 1 meeting held on 9/6/2026"), "2026-06-09");
  assert.equal(meetingDateInReason("no date here"), null);
});
