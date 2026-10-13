import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test stays importless and is reached this way. */
import { asItWillBeSent, inlineDisposition, previewFileName } from "./preview.ts";

const draft = { number: null, status: "draft", issue_date: null, due_date: null, vat_applied: false, vat_number_snapshot: null };
const noVat = { vat_enabled: false, vat_number: "GB123", default_payment_terms_days: 30 };
const vat = { vat_enabled: true, vat_number: "GB123456789", default_payment_terms_days: null };

test("blank dates are stamped as Send stamps them: today, and today + terms", () => {
  const p = asItWillBeSent(draft, noVat, "2026-10-13");
  assert.equal(p.issue_date, "2026-10-13");
  assert.equal(p.due_date, "2026-11-12");
  assert.equal(asItWillBeSent(draft, vat, "2026-10-13").due_date, "2026-10-27"); // 14 days when unset
});

test("dates already on the draft are kept", () => {
  const p = asItWillBeSent({ ...draft, issue_date: "2026-10-01", due_date: "2026-10-31" }, noVat, "2026-10-13");
  assert.equal(p.issue_date, "2026-10-01");
  assert.equal(p.due_date, "2026-10-31");
});

test("VAT number only when VAT is on, as Send does", () => {
  assert.equal(asItWillBeSent(draft, vat, "2026-10-13").vat_number_snapshot, "GB123456789");
  assert.equal(asItWillBeSent(draft, vat, "2026-10-13").vat_applied, true);
  assert.equal(asItWillBeSent(draft, noVat, "2026-10-13").vat_number_snapshot, null);
  assert.equal(asItWillBeSent(draft, noVat, "2026-10-13").vat_applied, false);
});

test("never a number, never sent: number and status are untouched", () => {
  const p = asItWillBeSent(draft, vat, "2026-10-13");
  assert.equal(p.number, null);
  assert.equal(p.status, "draft");
});

test("month end, leap day and the clock change", () => {
  assert.equal(asItWillBeSent(draft, noVat, "2026-01-31").due_date, "2026-03-02");
  assert.equal(asItWillBeSent(draft, { ...noVat, default_payment_terms_days: 1 }, "2028-02-28").due_date, "2028-02-29");
  assert.equal(asItWillBeSent(draft, { ...noVat, default_payment_terms_days: 7 }, "2026-10-22").due_date, "2026-10-29");
});

test("the file name: no dashes, nothing unsafe", () => {
  assert.equal(previewFileName("Jane Smith"), "Draft invoice for Jane Smith.pdf");
  assert.equal(previewFileName("Smith-Jones / Co"), "Draft invoice for Smith Jones Co.pdf");
  assert.equal(previewFileName("A – B"), "Draft invoice for A B.pdf");
  assert.equal(previewFileName(""), "Draft invoice.pdf");
  assert.equal(previewFileName(null), "Draft invoice.pdf");
  assert.ok(!/[-–—]/.test(previewFileName("Ann-Marie O'Neil")));
});

test("the header opens it in the tab, with a plain fallback name", () => {
  assert.equal(
    inlineDisposition("Draft invoice for Siân Ellis.pdf"),
    `inline; filename="Draft invoice for Sin Ellis.pdf"; filename*=UTF-8''Draft%20invoice%20for%20Si%C3%A2n%20Ellis.pdf`,
  );
});
