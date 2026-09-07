import { test } from "node:test";
import assert from "node:assert/strict";
import { standDownKeys, type GatedField } from "./stand-down.ts";

/* The Spot Check shape: a gate part way down the first section, then the rest. */
const SPOT_CHECK: GatedField[] = [
  { key: "spot_check_date" },
  { key: "scheduled_time" },
  { key: "able_to_complete", standsDown: { when: ["no"] } },
  { key: "service_user" },
  { key: "arrived_on_time" },
  { key: "declaration" },
];

test("no gate anywhere stands nothing down", () => {
  const plain: GatedField[] = [{ key: "a" }, { key: "b" }];
  assert.equal(standDownKeys(plain, { a: "no" }).size, 0);
});

test("an unanswered gate stands nothing down", () => {
  assert.equal(standDownKeys(SPOT_CHECK, {}).size, 0);
});

test("an answer that is not the gate value stands nothing down", () => {
  assert.equal(standDownKeys(SPOT_CHECK, { able_to_complete: "yes" }).size, 0);
});

test("the gate value stands down everything after it", () => {
  const down = standDownKeys(SPOT_CHECK, { able_to_complete: "no" });
  assert.deepEqual([...down], ["service_user", "arrived_on_time", "declaration"]);
});

test("the Service User is stood down with the rest", () => {
  assert.ok(standDownKeys(SPOT_CHECK, { able_to_complete: "no" }).has("service_user"));
});

test("the gate itself is never stood down", () => {
  assert.ok(!standDownKeys(SPOT_CHECK, { able_to_complete: "no" }).has("able_to_complete"));
});

test("questions before the gate are never stood down", () => {
  const down = standDownKeys(SPOT_CHECK, { able_to_complete: "no" });
  assert.ok(!down.has("spot_check_date"));
  assert.ok(!down.has("scheduled_time"));
});

test("a multi select answer containing the gate value stands the rest down", () => {
  const fields: GatedField[] = [
    { key: "reasons", standsDown: { when: ["abandoned"] } },
    { key: "detail" },
  ];
  assert.ok(standDownKeys(fields, { reasons: ["late", "abandoned"] }).has("detail"));
});

test("a gate reads a non string answer as the string a rule is written in", () => {
  const fields: GatedField[] = [{ key: "went_ahead", standsDown: { when: ["false"] } }, { key: "detail" }];
  assert.ok(standDownKeys(fields, { went_ahead: false }).has("detail"));
});

test("a stood down gate cannot itself decide anything", () => {
  /* second_gate is already stood down by the first; its stale answer must not matter,
     and the fields after it stay stood down either way. */
  const fields: GatedField[] = [
    { key: "first_gate", standsDown: { when: ["no"] } },
    { key: "second_gate", standsDown: { when: ["yes"] } },
    { key: "tail" },
  ];
  const down = standDownKeys(fields, { first_gate: "no", second_gate: "yes" });
  assert.deepEqual([...down], ["second_gate", "tail"]);
});

test("a later gate still works when the earlier one is not tripped", () => {
  const fields: GatedField[] = [
    { key: "first_gate", standsDown: { when: ["no"] } },
    { key: "middle" },
    { key: "second_gate", standsDown: { when: ["no"] } },
    { key: "tail" },
  ];
  const down = standDownKeys(fields, { first_gate: "yes", second_gate: "no" });
  assert.deepEqual([...down], ["tail"]);
});

test("an empty form stands nothing down", () => {
  assert.equal(standDownKeys([], { able_to_complete: "no" }).size, 0);
});

test("a null answer is not a gate value even when the rule lists an empty string", () => {
  const fields: GatedField[] = [{ key: "gate", standsDown: { when: [""] } }, { key: "tail" }];
  assert.equal(standDownKeys(fields, { gate: null }).size, 0);
});
