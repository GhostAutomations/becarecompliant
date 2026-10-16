import test from "node:test";
import assert from "node:assert/strict";
import { activityDetail, activityHref, activityTitle, activityWhen, canBeNotified, completionEmailSubject, coversWholeCompany } from "./activity.ts";

test("title and email subject", () => {
  assert.equal(activityTitle("Care Plan Review"), "Care Plan Review completed");
  assert.equal(completionEmailSubject("Care Plan Review", "A Person"), "Care Plan Review completed for A Person");
  assert.equal(completionEmailSubject("Supervision", null), "Supervision completed");
});

test("opens the Evidence when there is one, otherwise the record", () => {
  assert.equal(activityHref({ evidenceId: "e1", recordKind: "service_user", recordId: "s1" }), "/evidence/e1");
  assert.equal(activityHref({ evidenceId: null, recordKind: "service_user", recordId: "s1" }), "/service-users/s1");
  assert.equal(activityHref({ evidenceId: null, recordKind: "person", recordId: "p1" }), "/people/p1");
});

test("detail: only the known parts, commas, no dashes", () => {
  assert.equal(activityDetail({ recordName: "A Person", actorName: "A Carer", branchName: "Swansea" }), "for A Person, by A Carer, Swansea");
  assert.equal(activityDetail({ recordName: null, actorName: null, branchName: "Swansea" }), "Swansea");
  assert.doesNotMatch(activityDetail({ recordName: "A", actorName: "B", branchName: "C" }), / [-–—] /);
});

test("when: today in London, otherwise the date; British Summer Time and GMT", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  assert.equal(activityWhen("2026-10-14T08:05:00Z", now), "Today, 09:05");
  assert.equal(activityWhen("2026-10-13T22:30:00Z", now), "13 Oct 2026, 23:30");
  // 23:30 UTC on 31 Oct is still 31 Oct in London once the clocks have gone back.
  assert.equal(activityWhen("2026-10-31T23:30:00Z", new Date("2026-11-02T12:00:00Z")), "31 Oct 2026, 23:30");
  // 23:30 UTC on 29 Feb 2028.
  assert.equal(activityWhen("2028-02-29T23:30:00Z", new Date("2028-03-02T12:00:00Z")), "29 Feb 2028, 23:30");
});

test("who can be notified: only roles that can open other people's checks", () => {
  for (const r of ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter"]) assert.equal(canBeNotified(r), true, r);
  for (const r of ["team_member", "on_call", "staff", "senior", "platform_admin"]) assert.equal(canBeNotified(r), false, r);
  assert.equal(coversWholeCompany("recruiter"), true);
  assert.equal(coversWholeCompany("supervisor"), false);
});

test("display date", async () => {
  const { displayDate } = await import("./activity.ts");
  assert.equal(displayDate("2028-02-29"), "29 Feb 2028");
  assert.equal(displayDate(null), null);
});

test("a concern line opens the concern and says what it is (Rota and Visits Stage 5)", async () => {
  const { activityHref, activityRowTitle } = await import("./activity.ts");
  const row = { evidenceId: null, recordKind: "service_user" as const, recordId: "su1", concernId: "c1", checkName: "Check" };
  assert.equal(activityHref(row), "/rota/concerns?concern=c1");
  assert.equal(activityRowTitle(row), "Concern raised in a care note");
  // a completed check is unchanged
  assert.equal(activityHref({ ...row, concernId: null, evidenceId: "e1" }), "/evidence/e1");
  assert.equal(activityRowTitle({ checkName: "Care Plan Review", concernId: null }), "Care Plan Review completed");
});
