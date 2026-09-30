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

test("the Order's price and included lines", async () => {
  const { orderPriceText, orderIncludedText } = await import("./fill.ts");
  assert.equal(orderPriceText({ tier: "business", billingOption: "monthly", monthlyPence: 7900, annualMonths: 10 }), "£79 a month plus VAT");
  assert.equal(orderPriceText({ tier: "pro", billingOption: "annual", monthlyPence: 12900, annualMonths: 10 }), "£1,290 a year plus VAT, paid yearly in advance");
  assert.match(orderPriceText({ tier: "black", billingOption: "monthly", monthlyPence: null, annualMonths: 10 }), /No charge/);
  assert.equal(
    orderIncludedText({ users: 4, branches: 1, ai: 25, sms: 0 }),
    "4 users, office team and 1 branch, 25 AI credits a month, no text messages, free carer logins",
  );
  assert.equal(
    orderIncludedText({ users: 9999, branches: 9999, ai: 1000, sms: 2000 }),
    "unlimited users, office team and unlimited branches, 1000 AI credits a month, 2000 text messages a month, free carer logins",
  );
});

test("the agreement carries the new clauses", () => {
  for (const c of ["7.7 **Refunds", "8.4 On the Annual option", "11.6 **Retention.**", "11.8 **Anonymous themes", "15.4 Fees continue", "These are not added together", "19.4 A change we must make"]) {
    assert.ok(SUBSCRIPTION_AGREEMENT_1_0.includes(c), c);
  }
  assert.ok(DATA_PROCESSING_AGREEMENT_1_0.includes("Information Commission"));
  assert.ok(!DATA_PROCESSING_AGREEMENT_1_0.includes("Binding Corporate Rules"));
});

test("a draft says so and carries the version its Order will record; published text carries its date", () => {
  const draft = fillLegalText(SUBSCRIPTION_AGREEMENT_1_0, EMPTY, "1.0");
  assert.ok(draft.includes("**Version 1.0, draft, subject to legal review**"));
  const live = fillLegalText(SUBSCRIPTION_AGREEMENT_1_0, FULL, "1.0");
  assert.ok(live.includes("**Version 1.0 · 1 November 2026**"));
  assert.ok(!live.includes("{{"));
});

test("a Black account has no billing option (Phil, 2026-09-30)", async () => {
  const { billingApplies, billingOptionLabel, checkOrder } = await import("./fill.ts");
  assert.equal(billingApplies("black"), false);
  assert.equal(billingApplies("pro"), true);
  assert.equal(billingApplies("business"), true);
  const base = { legalName: "Bevan Care Ltd", organisationType: "partnership", companyNumber: "", address: "1 Test Street", accepted: true };
  assert.deepEqual(checkOrder({ ...base, billingOption: "none" }, { billingApplies: false }), {});
  assert.ok(checkOrder({ ...base, billingOption: "monthly" }, { billingApplies: false }).billingOption);
  assert.ok(checkOrder({ ...base, billingOption: "none" }).billingOption);
  assert.deepEqual(checkOrder({ ...base, billingOption: "annual" }), {});
  assert.equal(billingOptionLabel("none"), "Not applicable (Black account)");
  assert.equal(billingOptionLabel("annual"), "Annual");
  assert.equal(billingOptionLabel("monthly"), "Monthly");
});

test("the Order table in the agreement fills from the Order (Phil, 2026-09-30)", async () => {
  const { fillOrderTable, orderTableValues, ORDER_ROWS } = await import("./fill.ts");
  const values = orderTableValues({
    legalName: "Bevan Care Ltd",
    organisationType: "limited_company",
    companyNumber: "12345678",
    address: "1 Test Street\nCardiff | CF10 1AA",
    plan: "Pro",
    price: "£1,290 a year plus VAT, paid yearly in advance",
    included: "6 users, office team and 2 branches",
    extraUsers: "None",
    extraBranches: "1, at £25.00 a month each",
    extrasPaid: "Yearly with the plan, ten months' price for twelve",
    total: "£1,540.00 a year plus VAT",
    billingOption: "annual",
    priceList: "29 September 2026",
    onboardingFee: "Waived (joined by 31 December 2026)",
    startDate: "30 September 2026",
    acceptedBy: "Bev **Admin**",
    acceptedOn: "When you press Accept",
    agreementVersion: "1.0",
    dpaVersion: "1.0",
  });
  const out = fillOrderTable(SUBSCRIPTION_AGREEMENT_1_0, values);
  assert.ok(out.includes("| Billing option | Annual |"));
  assert.ok(out.includes("| Start date | 30 September 2026 |"));
  assert.ok(out.includes("| Registered or main address | 1 Test Street, Cardiff / CF10 1AA |"), "one line, no column break");
  assert.ok(out.includes("| Accepted by | Bev Admin, Company Admin |"), "no bold markers from typed text");
  assert.ok(!out.slice(out.indexOf("## The Order")).includes("[ ]"), "no blanks left in the Order");
  // Everything before the Order is untouched, so the terms read exactly as published.
  const cut = SUBSCRIPTION_AGREEMENT_1_0.indexOf("\n## The Order");
  assert.equal(out.slice(0, cut), SUBSCRIPTION_AGREEMENT_1_0.slice(0, cut));
  // Every row label in the template is one the filler knows, so none is left as a template row.
  const rows = SUBSCRIPTION_AGREEMENT_1_0.slice(cut).split("\n").filter((l) => /^\| [^|]+ \| .* \|$/.test(l));
  assert.equal(rows.length, ORDER_ROWS.length);
  // Still parses into one table with every row.
  const table = parseLegalMarkdown(out).filter((b) => b.kind === "table").pop();
  assert.ok(table && table.kind === "table" && table.rows.length === ORDER_ROWS.length);
  // An empty answer reads as not filled in, never as a bare blank.
  const empty = fillOrderTable(SUBSCRIPTION_AGREEMENT_1_0, { ...values, "Customer legal name": "  " });
  assert.ok(empty.includes("| Customer legal name | Not filled in yet |"));
  // Nothing to fill: text returned as it was.
  assert.equal(fillOrderTable("no order here", values), "no order here");
});

test("extras on the Order and where Accept goes next (Phil, 2026-09-30)", async () => {
  const { orderExtrasText, orderPriceListText, afterAcceptPath, isLiveSubscription } = await import("./fill.ts");
  const extras = orderExtrasText({ tier: "pro", seatPence: 500, branchPence: 2500 });
  assert.equal(extras, "£5 a month for each extra user, £25 a month for each extra branch, plus VAT");
  assert.equal(orderPriceListText(extras, "29 September 2026"), `${extras} (prices from 29 September 2026)`);
  assert.match(orderExtrasText({ tier: "black", seatPence: 500, branchPence: 2500 }), /Black account/);
  assert.equal(orderExtrasText({ tier: "business", seatPence: 750, branchPence: 2500 }).startsWith("£7.50 a month"), true);

  assert.equal(afterAcceptPath({ tier: "pro", liveSubscription: false }), "/agreement/payment");
  assert.equal(afterAcceptPath({ tier: "business", liveSubscription: false }), "/agreement/payment");
  assert.equal(afterAcceptPath({ tier: "pro", liveSubscription: true }), "/dashboard");
  assert.equal(afterAcceptPath({ tier: "black", liveSubscription: false }), "/dashboard");

  assert.equal(isLiveSubscription("active", "sub_1"), true);
  assert.equal(isLiveSubscription("past_due", "sub_1"), true);
  assert.equal(isLiveSubscription("canceled", "sub_1"), false);
  assert.equal(isLiveSubscription("active", null), false);
});

test("extras and the cost breakdown on the Order (Phil, 2026-09-30)", async () => {
  const { orderCosts, extrasLineText, extrasPaidText, checkOrder, money } = await import("./fill.ts");
  const base = { tier: "pro", plan: "Pro", monthlyPence: 12900, annualMonths: 10, seatPence: 500, branchPence: 2500, onboardingFee: "Waived" };
  assert.equal(money(129000), "£1,290.00");

  // Monthly, one extra branch: £129 + £25 = £154 a month.
  const m = orderCosts({ ...base, billingOption: "monthly", extrasBilling: "yearly", extraUsers: 0, extraBranches: 1 });
  assert.equal(m.groups.length, 1);
  assert.equal(m.groups[0].heading, "Your monthly cost");
  assert.deepEqual(m.groups[0].lines.map((l) => l.amount), ["£129.00", "£25.00"]);
  assert.equal(m.totalText, "£154.00 a month plus VAT");
  assert.equal(m.extrasBilling, "monthly");
  assert.equal(extrasPaidText(m, "monthly", "pro"), "Monthly, with the plan");

  // Annual, extras yearly: ten months' price for twelve on the extras too. 1290 + 2 x 5 x 10 + 1 x 25 x 10 = 1640.
  const y = orderCosts({ ...base, billingOption: "annual", extrasBilling: "yearly", extraUsers: 2, extraBranches: 1 });
  assert.equal(y.groups.length, 1);
  assert.equal(y.totalText, "£1,640.00 a year plus VAT");
  assert.equal(y.extrasBilling, "yearly");
  assert.match(y.groups[0].lines[1].label, /2 extra users x £5.00 x 10 months/);

  // Annual, extras monthly by card: full price each month. 1290 a year, 2 x 5 + 25 = 35 a month.
  const ym = orderCosts({ ...base, billingOption: "annual", extrasBilling: "monthly", extraUsers: 2, extraBranches: 1 });
  assert.equal(ym.groups.length, 2);
  assert.equal(ym.groups[1].total.amount, "£35.00");
  assert.equal(ym.totalText, "£1,290.00 a year and £35.00 a month, plus VAT");
  assert.equal(extrasPaidText(ym, "annual", "pro"), "Monthly, by card");

  // No extras on Annual: nothing to choose.
  const none = orderCosts({ ...base, billingOption: "annual", extrasBilling: "monthly", extraUsers: 0, extraBranches: 0 });
  assert.equal(none.totalText, "£1,290.00 a year plus VAT");
  assert.equal(extrasPaidText(none, "annual", "pro"), "No extras");

  // Black: no charge, nothing asked.
  const black = orderCosts({ ...base, tier: "black", monthlyPence: null, billingOption: "none", extrasBilling: "yearly", extraUsers: 0, extraBranches: 0 });
  assert.equal(black.groups.length, 0);
  assert.match(black.totalText, /Black account/);
  assert.equal(extrasLineText(3, 2500, "black"), "Not applicable (Black account)");
  assert.equal(extrasLineText(0, 500, "pro"), "None");
  assert.equal(extrasLineText(2, 500, "pro"), "2, at £5.00 a month each");

  // The form's checks.
  const order = { legalName: "Bevan Care Ltd", organisationType: "partnership", companyNumber: "", address: "1 Test Street", billingOption: "monthly", accepted: true };
  assert.deepEqual(checkOrder({ ...order, extraUsers: "0", extraBranches: "2" }), {});
  assert.ok(checkOrder({ ...order, extraUsers: "-1", extraBranches: "0" }).extraUsers);
  assert.ok(checkOrder({ ...order, extraUsers: "", extraBranches: "0" }).extraUsers);
  assert.ok(checkOrder({ ...order, extraUsers: "0", extraBranches: "51" }).extraBranches);
  assert.ok(checkOrder({ ...order, billingOption: "annual", extraUsers: "0", extraBranches: "1", extrasBilling: "weekly" }).extrasBilling);
  assert.deepEqual(checkOrder({ ...order, billingOption: "none", extraUsers: "-5" }, { billingApplies: false }), {}, "Black is not asked");
});
