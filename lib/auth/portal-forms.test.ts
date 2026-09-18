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

test("raising a concern is a tick like any other", () => {
  /* It shipped locked on and Phil asked for it selectable the same day. The argument for locking
     it has not gone away, so it lives in the note the tile shows instead of in a refusal. */
  assert.equal(canUsePortalForm("whistleblowing"), true);
  const off = new Set([`staff|${portalFormKey("whistleblowing")}`]);
  assert.equal(canUsePortalForm("whistleblowing", off), false);
});

test("a switchable form still has to say what switching it off costs", () => {
  const concern = PORTAL_FORMS.find((f) => f.key === "whistleblowing")!;
  assert.equal(concern.locked, false);
  assert.ok(concern.note, "unticking this one needs a warning, not silence");
});

test("reporting an incident is a tick like any other, now that it is built", () => {
  // Greyed out until 2026-09-18, which was the whole problem: the person who saw the incident
  // could not report it. It is a real form now and a company can still switch it off.
  assert.equal(canUsePortalForm("incident_report", new Set()), true);
  const off = new Set([`staff|${portalFormKey("incident_report")}`]);
  assert.equal(canUsePortalForm("incident_report", off), false);
});

test("anything not built yet is never usable, ticked or not", () => {
  // Stated as the invariant rather than against one key, so it survives the next form being
  // finished: whatever is still marked unavailable must be refused however it is ticked.
  for (const f of PORTAL_FORMS.filter((x) => !x.available)) {
    assert.equal(canUsePortalForm(f.key), false, `${f.key} is not built and must be refused`);
    assert.equal(canUsePortalForm(f.key, new Set()), false, `${f.key} is not built and must be refused`);
  }
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
