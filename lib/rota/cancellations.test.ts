import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CANCEL_RULE, durationWords, parseRule, reasonLabelProblem, sortReasons, splitHours } from "./cancellations.ts";

const posted = (o: Record<string, string>) => (n: string) => o[n];

test("every branch starts at 48, 48 and 48 hours (decision 16)", () => {
  assert.deepEqual(DEFAULT_CANCEL_RULE, { noticeHours: 48, chargeHours: 48, payHours: 48 });
});

test("hours shown as people say them", () => {
  assert.deepEqual(splitHours(48), { value: 48, unit: "hours" });
  assert.deepEqual(splitHours(336), { value: 14, unit: "days" });
  assert.deepEqual(splitHours(100), { value: 100, unit: "hours" });
  assert.equal(durationWords(0), "Not at all");
  assert.equal(durationWords(24), "24 hours");
  assert.equal(durationWords(336), "14 days");
  assert.equal(durationWords(1), "1 hour");
});

test("a posted rule: hours or days, whole numbers, inside the bounds", () => {
  const ok = parseRule(posted({ notice_value: "48", notice_unit: "hours", charge_value: "14", charge_unit: "days", pay_value: "0", pay_unit: "hours" }));
  assert.ok("rule" in ok);
  if ("rule" in ok) assert.deepEqual(ok.rule, { noticeHours: 48, chargeHours: 336, payHours: 0 });
  assert.ok("error" in parseRule(posted({ notice_value: "31", notice_unit: "days", charge_value: "1", charge_unit: "hours", pay_value: "1", pay_unit: "hours" })));
  assert.ok("error" in parseRule(posted({ notice_value: "1.5", notice_unit: "hours", charge_value: "1", charge_unit: "hours", pay_value: "1", pay_unit: "hours" })));
  assert.ok("error" in parseRule(posted({ notice_value: "-1", notice_unit: "hours", charge_value: "1", charge_unit: "hours", pay_value: "1", pay_unit: "hours" })));
  assert.ok("error" in parseRule(posted({ notice_value: "1", notice_unit: "weeks", charge_value: "1", charge_unit: "hours", pay_value: "1", pay_unit: "hours" })));
  assert.ok("error" in parseRule(posted({ notice_value: "1", notice_unit: "hours", charge_value: "85", charge_unit: "days", pay_value: "1", pay_unit: "hours" })));
});

test("reasons A to Z, Other last, archived after", () => {
  const r = (label: string, code: string | null = null, archivedAt: string | null = null) => ({ label, code, archivedAt });
  const sorted = sortReasons([r("Other", "other"), r("Office error"), r("Zebra", null, "x"), r("Family cancelled"), r("carer unavailable")]);
  assert.deepEqual(sorted.map((x) => x.label), ["carer unavailable", "Family cancelled", "Office error", "Other", "Zebra"]);
  assert.equal(reasonLabelProblem("  "), "Write the reason.");
  assert.equal(reasonLabelProblem("Hospital"), null);
});
