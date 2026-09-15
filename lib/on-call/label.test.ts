import test from "node:test";
import assert from "node:assert/strict";
import { onCallLabel, withOnCallLabel, DEFAULT_ON_CALL_LABEL } from "./label.ts";

test("null, undefined and blank all mean the default", () => {
  assert.equal(onCallLabel(null), "On Call");
  assert.equal(onCallLabel(undefined), "On Call");
  assert.equal(onCallLabel(""), "On Call");
  assert.equal(onCallLabel("   "), "On Call");
  assert.equal(DEFAULT_ON_CALL_LABEL, "On Call");
});

test("a stored name is used, and trimmed", () => {
  assert.equal(onCallLabel("Out of Hours"), "Out of Hours");
  assert.equal(onCallLabel("  Out of Hours  "), "Out of Hours");
});

test("the On Call entry is renamed wherever it sits, including as a child", () => {
  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    {
      href: "/on-call",
      label: "On Call",
      children: [
        { href: "/on-call", label: "On Call" },
        { href: "/on-call/log", label: "Handover" },
      ],
    },
  ];
  const out = withOnCallLabel(nav, "Out of Hours");
  assert.equal(out[1].label, "Out of Hours");
  assert.equal(out[1].children?.[0].label, "Out of Hours");
  assert.equal(out[1].children?.[1].label, "Handover", "other children are left alone");
  assert.equal(out[0].label, "Dashboard");
});

test("it matches on the href, so it survives the default being reworded", () => {
  const nav = [{ href: "/on-call", label: "Something Else Entirely" }];
  assert.equal(withOnCallLabel(nav, "Out of Hours")[0].label, "Out of Hours");
});

test("the source entries are never mutated, because the nav is shared between requests", () => {
  const nav = [
    { href: "/on-call", label: "On Call", children: [{ href: "/on-call", label: "On Call" }] },
  ];
  const before = JSON.stringify(nav);
  withOnCallLabel(nav, "Out of Hours");
  assert.equal(JSON.stringify(nav), before);
});

test("the default label changes nothing and still returns a new array", () => {
  const nav = [{ href: "/on-call", label: "On Call" }];
  const out = withOnCallLabel(nav, "On Call");
  assert.deepEqual(out, nav);
  assert.notEqual(out, nav);
});

test("a nav with no On Call entry is returned unharmed", () => {
  const nav = [{ href: "/people", label: "People" }];
  assert.deepEqual(withOnCallLabel(nav, "Out of Hours"), nav);
});
