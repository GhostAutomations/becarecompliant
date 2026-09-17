import { test } from "node:test";
import assert from "node:assert/strict";
import { PORTAL_FORMS, canUsePortalForm, portalFormKey } from "./portal-forms.ts";

test("absence means on, as it does for the departments", () => {
  assert.equal(canUsePortalForm("holiday_requests"), true);
  assert.equal(canUsePortalForm("financial_transaction", new Set()), true);
});

test("switching one off leaves the others alone", () => {
  const off = new Set([`staff|${portalFormKey("holiday_requests")}`]);
  assert.equal(canUsePortalForm("holiday_requests", off), false);
  assert.equal(canUsePortalForm("financial_transaction", off), true);
});

test("raising a concern cannot be switched off", () => {
  /* The one that matters. A route for raising a concern that the employer can remove is not a
     route for raising a concern, and the companies that would most want it gone are exactly the
     ones whose carers need it. */
  const off = new Set([`staff|${portalFormKey("whistleblowing")}`]);
  assert.equal(canUsePortalForm("whistleblowing", off), true);
});

test("something not built yet is never usable, ticked or not", () => {
  assert.equal(canUsePortalForm("incident_report"), false);
  assert.equal(canUsePortalForm("incident_report", new Set()), false);
});

test("a form nobody has heard of is refused rather than allowed", () => {
  assert.equal(canUsePortalForm("payroll_export"), false);
});

test("every portal form has a key, a label and a hint, and keys are unique", () => {
  const keys = PORTAL_FORMS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "two portal forms share a key");
  for (const f of PORTAL_FORMS) {
    assert.ok(f.label.trim().length > 0, `${f.key} has no label`);
    assert.ok(f.hint.trim().length > 0, `${f.key} has no hint`);
    if (!f.available || f.locked) assert.ok(f.note, `${f.key} is greyed with no reason given`);
  }
});
