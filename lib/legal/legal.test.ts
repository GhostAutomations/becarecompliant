import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLegalMarkdown, parseRuns, headingId } from "./markdown.ts";
import { fillLegalText, missingSupplier, checkOrder, onboardingFeeLabel, planLabel } from "./fill.ts";
import { SUBSCRIPTION_AGREEMENT_1_0, DATA_PROCESSING_AGREEMENT_1_0 } from "./text.ts";
import { SUPPLIER, type Supplier } from "./supplier.ts";

const FULL: Supplier = {
  name: "Example Ltd",
  number: "12345678",
  address: "1 High Street, Cardiff",
  ico: "ZB000000",
  liabilityFloor: "£10,000",
  publicationDate: "1 November 2026",
};
const EMPTY: Supplier = { name: null, number: null, address: null, ico: null, liabilityFloor: null, publicationDate: null };

test("runs: bold, plain and an unmatched marker", () => {
  assert.deepEqual(parseRuns("a **b** c"), [
    { text: "a ", bold: false },
    { text: "b", bold: true },
    { text: " c", bold: false },
  ]);
  assert.deepEqual(parseRuns("**we**"), [{ text: "we", bold: true }]);
  assert.deepEqual(parseRuns("a **b"), [{ text: "a **b", bold: false }]);
});

test("headings get clause anchors", () => {
  assert.equal(headingId("16. Length of this agreement and ending it"), "clause-16");
  assert.equal(headingId("Annex 3: Subprocessors"), "annex-3-subprocessors");
});

test("the agreement parses into a title, 20 clauses, a rule and the Order table", () => {
  const b = parseLegalMarkdown(fillLegalText(SUBSCRIPTION_AGREEMENT_1_0, FULL));
  assert.equal(b[0].kind, "title");
  const clauses = b.filter((x) => x.kind === "heading" && x.id.startsWith("clause-"));
  assert.equal(clauses.length, 20);
  assert.ok(b.some((x) => x.kind === "rule"));
  const table = b.find((x) => x.kind === "table");
  assert.ok(table && table.kind === "table");
  assert.equal(table.header, null, "the Order table has an empty header row");
  assert.ok(table.rows.some((r) => r[0][0]?.text === "Onboarding fee"));
});

test("the DPA subprocessor table has a header and five rows", () => {
  const b = parseLegalMarkdown(fillLegalText(DATA_PROCESSING_AGREEMENT_1_0, FULL));
  const table = b.find((x) => x.kind === "table");
  assert.ok(table && table.kind === "table" && table.header);
  assert.equal(table.rows.length, 5);
});

test("filling: every token replaced, placeholders while missing", () => {
  const full = fillLegalText(SUBSCRIPTION_AGREEMENT_1_0 + DATA_PROCESSING_AGREEMENT_1_0, FULL);
  assert.ok(!full.includes("{{"), "no token left");
  assert.ok(full.includes("Example Ltd") && full.includes("ZB000000") && full.includes("£10,000"));
  const draft = fillLegalText(SUBSCRIPTION_AGREEMENT_1_0, EMPTY);
  assert.ok(!draft.includes("{{") && !draft.includes("null"));
  assert.ok(draft.includes("[Company name]") && draft.includes("£[ ]"));
});

test("the contract is a draft until every supplier detail is in", () => {
  assert.equal(missingSupplier(EMPTY).length, 6);
  assert.deepEqual(missingSupplier(FULL), []);
  assert.deepEqual(missingSupplier({ ...FULL, ico: "  " }), ["ICO registration number"]);
  // What ships today: still a draft, so no Company Admin is stopped.
  assert.ok(missingSupplier(SUPPLIER).length > 0);
});

test("no dashes in the customer text", () => {
  for (const t of [SUBSCRIPTION_AGREEMENT_1_0, DATA_PROCESSING_AGREEMENT_1_0]) {
    assert.ok(!/[–—]/.test(t), "no en or em dash");
    assert.ok(!/ - /.test(t), "no spaced hyphen");
  }
});

test("Diamond is gone from the agreement", () => {
  assert.ok(!/diamond/i.test(SUBSCRIPTION_AGREEMENT_1_0));
});

test("order checks", () => {
  const ok = { legalName: "Bevan Care Ltd", organisationType: "limited_company", companyNumber: "123", address: "1 Road, Swansea", billingOption: "monthly", accepted: true };
  assert.deepEqual(checkOrder(ok), {});
  assert.ok(checkOrder({ ...ok, companyNumber: "" }).companyNumber);
  assert.deepEqual(checkOrder({ ...ok, organisationType: "sole_trader", companyNumber: "" }), {});
  assert.ok(checkOrder({ ...ok, billingOption: "weekly" }).billingOption);
  assert.ok(checkOrder({ ...ok, accepted: false }).accepted);
  assert.ok(checkOrder({ ...ok, legalName: " " }).legalName);
  assert.ok(checkOrder({ ...ok, organisationType: "club" }).organisationType);
});

test("onboarding fee on the Order", () => {
  const base = { fee: "£295", offerEnd: "31 December 2026" };
  assert.equal(onboardingFeeLabel({ ...base, tier: "pro", offerActive: true }), "Waived (joined by 31 December 2026)");
  assert.equal(onboardingFeeLabel({ ...base, tier: "business", offerActive: false }), "£295 plus VAT");
  assert.match(onboardingFeeLabel({ ...base, tier: "black", offerActive: false }), /Not applicable/);
  assert.equal(planLabel("pro"), "Pro");
  assert.equal(planLabel(null), "Business");
});

test("which acceptance counts", async () => {
  const { acceptanceCurrent, agreementGateOn } = await import("./fill.ts");
  const v = { agreement: "1.0", dpa: "1.0" };
  const draft = { agreement_version: "1.0", dpa_version: "1.0", is_draft: true };
  const real = { agreement_version: "1.0", dpa_version: "1.0", is_draft: false };
  const old = { agreement_version: "0.9", dpa_version: "1.0", is_draft: false };
  assert.equal(acceptanceCurrent([], v, false), false);
  assert.equal(acceptanceCurrent([draft], v, false), true, "a test acceptance counts while it is a draft");
  assert.equal(acceptanceCurrent([draft], v, true), false, "and not once published");
  assert.equal(acceptanceCurrent([draft, real], v, true), true);
  assert.equal(acceptanceCurrent([old], v, true), false, "a new version asks again");
  assert.equal(agreementGateOn(false, false), false, "off for everybody while a draft");
  assert.equal(agreementGateOn(false, true), true, "on for a test company");
  assert.equal(agreementGateOn(true, false), true, "on for all once published");
});
