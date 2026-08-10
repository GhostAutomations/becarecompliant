import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test stays importless and is reached this way. */
import { overdueForRecipient, type OverdueRow } from "./overdue-scope.ts";

function row(id: string, branch: string | null): OverdueRow {
  return {
    id,
    number: `INV-${id}`,
    branch_id: branch,
    due_date: "2026-07-28",
    total_pence: 10000,
    service_users: { full_name: `Client ${id}` },
  };
}

const CAERPHILLY = "caerphilly-id";
const NEWPORT = "newport-id";

const ROWS = [row("1", CAERPHILLY), row("2", NEWPORT), row("3", null)];

test("a Company Admin is told about every overdue invoice", () => {
  const got = overdueForRecipient(ROWS, { role: "company_admin", branchIds: [] });
  assert.deepEqual(got.map((r) => r.id), ["1", "2", "3"]);
});

test("a Manager is told ONLY about their own branches", () => {
  // The real bug: a Manager of Newport was emailed seven Caerphilly invoices with client
  // names and amounts on every line.
  const got = overdueForRecipient(ROWS, { role: "manager", branchIds: [NEWPORT] });
  assert.deepEqual(got.map((r) => r.id), ["2"]);
});

test("an invoice with NO branch is withheld from a Manager, not shown to everyone", () => {
  const got = overdueForRecipient([row("3", null)], { role: "manager", branchIds: [NEWPORT] });
  assert.deepEqual(got, [], "fail closed on a missing branch");
});

test("a Manager with no branches at all is told nothing", () => {
  assert.deepEqual(overdueForRecipient(ROWS, { role: "manager", branchIds: [] }), []);
});

test("a Manager of several branches sees each of them", () => {
  const got = overdueForRecipient(ROWS, { role: "manager", branchIds: [NEWPORT, CAERPHILLY] });
  assert.deepEqual(got.map((r) => r.id), ["1", "2"]);
});

test("an UNKNOWN role is told NOTHING, it does not fall through to the whole company", () => {
  // The safety must live here, not in a Set in another file. If supervisor is ever added to
  // MANAGER_PLUS, or a new role invented, it must not leak every client name and amount.
  assert.deepEqual(overdueForRecipient(ROWS, { role: "supervisor", branchIds: [] }), []);
  assert.deepEqual(overdueForRecipient(ROWS, { role: "supervisor", branchIds: [NEWPORT] }), []);
  assert.deepEqual(overdueForRecipient(ROWS, { role: "on_call", branchIds: [] }), []);
  assert.deepEqual(overdueForRecipient(ROWS, { role: "staff", branchIds: [] }), []);
  assert.deepEqual(overdueForRecipient(ROWS, { role: "", branchIds: [] }), []);
});

test("only company_admin is company wide, and the Registered roles arrive AS company_admin", () => {
  // getRecipients normalises registered_individual and registered_manager to company_admin, so
  // the raw strings must NOT be treated as company wide here.
  assert.equal(overdueForRecipient(ROWS, { role: "company_admin", branchIds: [] }).length, 3);
  assert.deepEqual(overdueForRecipient(ROWS, { role: "registered_manager", branchIds: [] }), []);
});

