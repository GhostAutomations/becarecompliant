import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPLIANCE_RECIPIENT_ROLES,
  HOLIDAY_APPROVER_ROLES,
  isCompanyWideRole,
  normaliseRecipientRole,
  holidayApprovers,
  SMS_ESCALATION_ROLES,
} from "./roles.ts";

/** Every role profiles_role_check allows, so a new one cannot be added to the
 *  database and quietly miss every email. */
const ALL_ROLES = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "team_member",
  "on_call",
  "staff",
];

test("the two Registered roles are company wide, and nothing else new is", () => {
  for (const role of ["company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(isCompanyWideRole(role), true, role);
  }
  for (const role of ["platform_admin", "manager", "supervisor", "team_member", "on_call", "staff"]) {
    assert.equal(isCompanyWideRole(role), false, role);
  }
});

test("a Registered Individual and a Registered Manager are scoped as an Admin", () => {
  assert.equal(normaliseRecipientRole("registered_individual"), "company_admin");
  assert.equal(normaliseRecipientRole("registered_manager"), "company_admin");
  assert.equal(normaliseRecipientRole("company_admin"), "company_admin");
});

test("a Manager stays a Manager and a Supervisor stays a Supervisor", () => {
  assert.equal(normaliseRecipientRole("manager"), "manager");
  assert.equal(normaliseRecipientRole("supervisor"), "supervisor");
});

test("nobody else is a compliance recipient, whatever else changes", () => {
  for (const role of ["platform_admin", "team_member", "on_call", "staff"]) {
    assert.equal(normaliseRecipientRole(role), null, role);
  }
});

test("the recipient list and the normaliser agree, in both directions", () => {
  for (const role of ALL_ROLES) {
    assert.equal(
      COMPLIANCE_RECIPIENT_ROLES.includes(role),
      normaliseRecipientRole(role) !== null,
      role,
    );
  }
});

test("the holiday approvers are the compliance recipients minus the Supervisor, exactly", () => {
  /*
   * A REAL EQUALITY, not a subset. The first version of this test asserted only
   * that every approver was also a recipient and that no Supervisor was one,
   * which both hold if the list is cut down to ["company_admin"] alone. That is
   * the 2026-07-27 defect over again: drop registered_manager and a Registered
   * Manager is silently never told a holiday request is waiting, with the suite
   * still green.
   */
  assert.deepEqual(
    [...HOLIDAY_APPROVER_ROLES].sort(),
    COMPLIANCE_RECIPIENT_ROLES.filter((r) => r !== "supervisor").sort(),
  );
});

test("every role's approver candidacy is pinned, all nine of them", () => {
  for (const role of ALL_ROLES) {
    const expected = ["company_admin", "registered_individual", "registered_manager", "manager"].includes(role);
    assert.equal(HOLIDAY_APPROVER_ROLES.includes(role), expected, role);
  }
});

test("the approver list drives the filter, so the two cannot drift apart", () => {
  // Built FROM the constant rather than a literal fixture: one of each approver
  // role, a Manager in the branch and a Manager outside it.
  const candidates = HOLIDAY_APPROVER_ROLES.map((role) => ({ id: role, role }));
  candidates.push({ id: "manager-outside", role: "manager" });
  const got = holidayApprovers({
    branchId: "cardiff",
    candidates,
    managerIdsInBranch: ["manager"],
  }).map((c) => c.id);
  assert.deepEqual(got, [...HOLIDAY_APPROVER_ROLES]);
  assert.equal(got.includes("manager-outside"), false);
});

const CANDIDATES = [
  { id: "admin", role: "company_admin" },
  { id: "ri", role: "registered_individual" },
  { id: "rm", role: "registered_manager" },
  { id: "mgr-in", role: "manager" },
  { id: "mgr-out", role: "manager" },
];

test("a branch request goes to the company wide roles and that branch's Manager only", () => {
  const got = holidayApprovers({
    branchId: "cardiff",
    candidates: CANDIDATES,
    managerIdsInBranch: ["mgr-in"],
  }).map((c) => c.id);
  assert.deepEqual(got, ["admin", "ri", "rm", "mgr-in"]);
});

test("a request with NO branch reaches no Branch Manager at all", () => {
  const got = holidayApprovers({
    branchId: null,
    candidates: CANDIDATES,
    managerIdsInBranch: ["mgr-in", "mgr-out"],
  }).map((c) => c.id);
  assert.deepEqual(got, ["admin", "ri", "rm"]);
});

test("a branch with no Manager still tells the company wide roles", () => {
  const got = holidayApprovers({
    branchId: "newport",
    candidates: CANDIDATES,
    managerIdsInBranch: [],
  }).map((c) => c.id);
  assert.deepEqual(got, ["admin", "ri", "rm"]);
});

test("a Supervisor or a Viewer in the candidate list is never an approver", () => {
  const got = holidayApprovers({
    branchId: "cardiff",
    candidates: [
      { id: "sup", role: "supervisor" },
      { id: "view", role: "team_member" },
      { id: "carer", role: "staff" },
    ],
    managerIdsInBranch: ["sup", "view", "carer"],
  });
  assert.deepEqual(got, []);
});

test("the Settings escalation list is exactly who the cron texts", () => {
  // The cron filters on the normalised role being company_admin or manager.
  const cronWouldText = ALL_ROLES.filter((r) => {
    const n = normaliseRecipientRole(r);
    return n === "company_admin" || n === "manager";
  });
  assert.deepEqual([...SMS_ESCALATION_ROLES].sort(), cronWouldText.sort());
});
