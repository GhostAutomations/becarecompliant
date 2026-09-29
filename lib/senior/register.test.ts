import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSeniorRegister, overdueCount, seniorPillClass, seniorPillLabel, type SeniorRegisterRow } from "./register.ts";

const row = (o: Partial<SeniorRegisterRow>): SeniorRegisterRow => ({
  record_id: "r1",
  full_name: "Ann Able",
  branch_name: "Cardiff",
  instance_id: null,
  check_name: null,
  check_key: null,
  check_order: null,
  due_date: null,
  last_completed_on: null,
  rag: null,
  has_form: null,
  ...o,
});

test("names with no ticked Check still appear, once", () => {
  const out = groupSeniorRegister([row({}), row({ record_id: "r2", full_name: "Bob Bee" })]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].records.map((r) => [r.name, r.checks.length]), [["Ann Able", 0], ["Bob Bee", 0]]);
});

test("Checks gather under their name, in the order they arrive, and a repeat is dropped", () => {
  const out = groupSeniorRegister([
    row({ instance_id: "i1", check_name: "Supervision", rag: "red", due_date: "2026-09-01", has_form: true }),
    row({ instance_id: "i2", check_name: "Spot Check", rag: "amber", has_form: true }),
    row({ instance_id: "i1", check_name: "Supervision", rag: "red" }),
  ]);
  const checks = out[0].records[0].checks;
  assert.deepEqual(checks.map((c) => c.name), ["Supervision", "Spot Check"]);
  assert.equal(checks[0].hasForm, true);
  assert.equal(overdueCount(out), 1);
});

test("branches are sorted and a record with no branch is kept", () => {
  const out = groupSeniorRegister([
    row({ branch_name: "Swansea" }),
    row({ record_id: "r2", branch_name: "Cardiff" }),
    row({ record_id: "r3", branch_name: null }),
  ]);
  assert.deepEqual(out.map((b) => b.name), ["Cardiff", "No branch", "Swansea"]);
});

test("an unknown RAG is shown as no due date rather than a colour", () => {
  const out = groupSeniorRegister([row({ instance_id: "i1", check_name: "Audit", rag: "purple" })]);
  assert.equal(out[0].records[0].checks[0].rag, "none");
});

test("pill words and classes", () => {
  assert.equal(seniorPillLabel({ rag: "red", lastCompletedOn: null }), "Overdue");
  assert.equal(seniorPillLabel({ rag: "amber", lastCompletedOn: null }), "Due soon");
  assert.equal(seniorPillLabel({ rag: "green", lastCompletedOn: null }), "Compliant");
  assert.equal(seniorPillLabel({ rag: "none", lastCompletedOn: "2026-01-01" }), "Done");
  assert.equal(seniorPillLabel({ rag: "none", lastCompletedOn: null }), "Not scheduled");
  assert.equal(seniorPillClass("red"), "pill-red");
  assert.equal(seniorPillClass("none"), "pill-neutral");
});
