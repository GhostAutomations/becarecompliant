import { test } from "node:test";
import assert from "node:assert/strict";
import { complaintHandling, incidentHandling, handlingPct, type IncidentRow } from "./case-handling.ts";

const TODAY = "2026-09-19";
const FROM = "2026-03-19";

test("a complaint answered late is graded late, and one past its date unanswered is overdue", () => {
  const h = complaintHandling(
    [
      { status: "closed", acknowledgement_due: "2026-06-03", date_acknowledged: "2026-06-02", response_due: "2026-06-30", date_closed: "2026-07-05" },
      { status: "open", acknowledgement_due: "2026-09-10", date_acknowledged: "2026-09-09", response_due: "2026-09-15", date_closed: null },
    ],
    TODAY,
    FROM,
  );
  assert.deepEqual(h, { overdue: 1, due: 4, onTime: 2 });
  assert.equal(handlingPct(h), 50);
});

test("a withdrawn complaint asks nothing", () => {
  const h = complaintHandling(
    [{ status: "withdrawn", acknowledgement_due: "2026-06-03", date_acknowledged: null, response_due: "2026-06-30", date_closed: null }],
    TODAY,
    FROM,
  );
  assert.deepEqual(h, { overdue: 0, due: 0, onTime: 0 });
});

const inc = (over: Partial<IncidentRow>): IncidentRow => ({
  status: "open",
  reported_on: "2026-09-01",
  occurred_on: "2026-09-01",
  investigation_completed: null,
  no_further_action: null,
  outcome_recorded_on: null,
  closed_on: null,
  notifiable: false,
  notified_on: null,
  safeguarding: false,
  safeguarding_referred_on: null,
  ...over,
});

test("an incident not investigated within 14 days is overdue", () => {
  assert.equal(incidentHandling([inc({})], TODAY, FROM).overdue, 1);
  assert.equal(incidentHandling([inc({ reported_on: "2026-09-10" })], TODAY, FROM).overdue, 0);
});

test("No further action asks for no outcome", () => {
  const h = incidentHandling(
    [inc({ investigation_completed: "2026-09-05", no_further_action: true })],
    TODAY,
    FROM,
  );
  assert.deepEqual(h, { overdue: 0, due: 1, onTime: 1 });
});

test("a notifiable incident with no notification, or safeguarding with no referral, is outstanding now", () => {
  const h = incidentHandling(
    [inc({ reported_on: "2026-09-15", notifiable: true, safeguarding: true })],
    TODAY,
    FROM,
  );
  assert.equal(h.overdue, 2);
});
