import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bankDetailRows, formatServiceDate, serviceDateParts, showsServiceDate, showsUnitPrice } from "./types.ts";

/**
 * The invoice line table, asserted against the SOURCE.
 *
 * These are the failures that do not throw and are not noticed until a client has the PDF: a
 * column set that does not add to 100%, a header and a row that disagree, a colSpan that no
 * longer matches the number of headings. The same trick as lib/ui/save-button.test.ts, which
 * reads globals.css.
 *
 * The table has two shapes since 2026-08-01: with a Unit price column, and without it on an
 * invoice raised before migration 0163 that has no printable price on any line.
 */

const pdf = readFileSync(new URL("./pdf-doc.tsx", import.meta.url), "utf8");
const page = readFileSync(
  new URL("../../app/(app)/invoicing/[id]/page.tsx", import.meta.url),
  "utf8",
);

/** The two width sets as written in the source, e.g. { service: "28%", ... }. */
function widthSets(): Record<string, string>[] {
  const sets = [...pdf.matchAll(/\{\s*service:\s*"(\d+)%",\s*unit:\s*"(\d+)%",\s*handed:\s*"(\d+)%",\s*qty:\s*"(\d+)%",\s*price:\s*"(\d+)%",\s*amount:\s*"(\d+)%"\s*\}/g)];
  return sets.map((m) => ({
    service: m[1], unit: m[2], handed: m[3], qty: m[4], price: m[5], amount: m[6],
  }));
}

test("both PDF column sets are declared and each adds up to a full page width", () => {
  const sets = widthSets();
  assert.equal(sets.length, 2, "expected exactly two width sets in pdf-doc.tsx");

  const [withPrice, withoutPrice] = sets;
  const sum = (o: Record<string, string>, keys: string[]) =>
    keys.reduce((t, k) => t + Number(o[k]), 0);

  const all = ["service", "unit", "handed", "qty", "price", "amount"];
  const five = ["service", "unit", "handed", "qty", "amount"];
  assert.equal(sum(withPrice, all), 100, "the six column set must total 100%");
  assert.equal(sum(withoutPrice, five), 100, "the five column set must total 100%");
  // The price width is unused in the second set; it must not be quietly taking space.
  assert.equal(withoutPrice.price, "0");
});

test("the PDF header and its rows read the same widths in the same order", () => {
  // Both blocks address the widths by name, so a divergence shows up as a different sequence.
  const order = (block: string) =>
    [...block.matchAll(/width:\s*w\.(\w+)/g)].map((m) => m[1]);
  const head = pdf.slice(pdf.indexOf("<View style={s.tHead}>"), pdf.indexOf("</View>", pdf.indexOf("<View style={s.tHead}>")));
  const row = pdf.slice(pdf.indexOf("<View style={s.tRow}>"), pdf.indexOf("</View>", pdf.indexOf("<View style={s.tRow}>")));
  // The Date column (2026-10-13) leads, and is only drawn when a line has a date.
  assert.deepEqual(order(head), ["date", "service", "unit", "handed", "qty", "price", "amount"]);
  assert.deepEqual(order(row), order(head));
});

test("the week separator spans exactly the number of headings there are", () => {
  const headings = [...page.matchAll(/<th[\s\S]*?>([^<]+)<\/th>/g)].map((m) => m[1].trim());
  assert.deepEqual(headings, ["Date", "Service", "Unit", "Handed", "Qty", "Unit price", "Amount"]);
  // Six headings with the price column, five without, one more with the Date column, and the
  // colSpan must say so.
  assert.ok(
    page.includes("colSpan={(showPrice ? 6 : 5) + (showDate ? 1 : 0)}"),
    "the week separator colSpan no longer matches the heading count",
  );
});

test("an invoice of only pre 2026-08-01 lines shows no column at all", () => {
  // 7 x £6.38 is £44.66, and that line was stored at £44.63, so it does not stand being
  // multiplied out and the column goes with it.
  assert.equal(showsUnitPrice([{ quantity: 7, unit_price_pence: 638, line_total_pence: 4463 }]), false);
});

/** The two width sets WITH the Date column, as written in the source. */
function dateWidthSets(): Record<string, number>[] {
  const sets = [...pdf.matchAll(/\{\s*date:\s*"(\d+)%",\s*service:\s*"(\d+)%",\s*unit:\s*"(\d+)%",\s*handed:\s*"(\d+)%",\s*qty:\s*"(\d+)%",\s*price:\s*"(\d+)%",\s*amount:\s*"(\d+)%"\s*\}/g)];
  return sets.map((m) => ({
    date: Number(m[1]), service: Number(m[2]), unit: Number(m[3]), handed: Number(m[4]), qty: Number(m[5]), price: Number(m[6]), amount: Number(m[7]),
  }));
}

test("both PDF column sets with the Date column add up to a full page width", () => {
  const sets = dateWidthSets();
  assert.equal(sets.length, 2, "expected exactly two width sets with a date in pdf-doc.tsx");
  const [withPrice, withoutPrice] = sets;
  const total = (o: Record<string, number>) => Object.values(o).reduce((t, v) => t + v, 0);
  assert.equal(total(withPrice), 100);
  assert.equal(total(withoutPrice), 100);
  assert.equal(withoutPrice.price, 0);
  // Room for "Wed 30/09/2026" at the row font size.
  assert.ok(withPrice.date >= 15 && withoutPrice.date >= 15);
});

test("the Date column shows on every invoice, dated lines or not (Phil, 2026-10-13, Always show it)", () => {
  assert.equal(showsServiceDate([{ service_date: null }, { service_date: null }]), true);
  assert.equal(showsServiceDate([]), true);
  assert.equal(showsServiceDate([{ service_date: null }, { service_date: "2026-10-05" }]), true);
});

test("a line date reads as the day and the UK date", () => {
  assert.equal(formatServiceDate("2026-10-05"), "Mon 05/10/2026");
  assert.equal(formatServiceDate("2026-10-11"), "Sun 11/10/2026");
  assert.equal(formatServiceDate("2028-02-29"), "Tue 29/02/2028");
  assert.equal(formatServiceDate("2026-10-25"), "Sun 25/10/2026"); // the clock change
  assert.equal(formatServiceDate(null), "");
  assert.equal(formatServiceDate(""), "");
  assert.equal(formatServiceDate("not a date"), "");
});

test("the day and the date come apart so the dates line up", () => {
  assert.deepEqual(serviceDateParts("2026-09-28"), { day: "Mon", date: "28/09/2026" });
  assert.deepEqual(serviceDateParts("2026-10-07"), { day: "Wed", date: "07/10/2026" });
  assert.equal(serviceDateParts(null), null);
  assert.equal(serviceDateParts("2026/10/07"), null);
  // The PDF sets the day in a fixed slot, so every row's date starts at the same place.
  assert.ok(pdf.includes("<DateCell style={{ width: w.date }} iso={l.service_date} />"));
  assert.ok(/<Text style=\{\[s\.td, \{ width: 24 \}\]\}>\{p\.day\}<\/Text>/.test(pdf));
});

test("issued, due, service period and paid print as DD/MM/YYYY on the page and the PDF", () => {
  for (const src of [pdf, page]) {
    assert.ok(src.includes("fmtDate(inv.issue_date)"));
    assert.ok(src.includes("fmtDate(inv.due_date)"));
    assert.ok(src.includes("fmtDate(inv.supply_period_start)"));
    assert.ok(src.includes("fmtDate(inv.paid_date)"));
  }
});

test("bank details: the four labels as Phil wrote them, only those filled in, none means the old text", () => {
  assert.deepEqual(
    bankDetailRows({ bank_account_name: "Example Care Ltd", bank_name: "Example Bank", bank_account_number: "12345678", bank_sort_code: "000000" }),
    [
      { label: "Account Name:", value: "Example Care Ltd" },
      { label: "Bank:", value: "Example Bank" },
      { label: "Account No:", value: "12345678" },
      { label: "Sort Code:", value: "000000" },
    ],
  );
  assert.deepEqual(bankDetailRows({ bank_account_name: " Example Care Ltd ", bank_name: "  " }), [{ label: "Account Name:", value: "Example Care Ltd" }]);
  assert.equal(bankDetailRows({}), null);
  assert.equal(bankDetailRows({ bank_account_name: null, bank_name: "", bank_account_number: null, bank_sort_code: null }), null);
});

test("the invoice email: Dear, due as DD/MM/YYYY, contact the reply to address, kind regards, shown light", () => {
  const tpl = readFileSync(new URL("../email/templates.ts", import.meta.url), "utf8");
  const start = tpl.indexOf("export function companyInvoiceEmailHtml");
  const body = tpl.slice(start, tpl.indexOf("export { escapeHtml", start));
  assert.ok(body.includes("Dear ${"));
  assert.ok(body.includes("Payment is due by"));
  assert.ok(body.includes("If you have any questions, please contact us at"));
  assert.ok(body.includes("Kind regards,"));
  assert.ok(body.includes('content="light only"'));
  assert.ok(!body.includes("please reply to this email"), "never \"please reply to this email\": it goes to the no reply address");
  // The list shows every date as DD/MM/YYYY.
  const list = readFileSync(new URL("../../app/(app)/invoicing/page.tsx", import.meta.url), "utf8");
  assert.ok(!list.includes("ukDate("));
  assert.ok(list.includes("listDate(inv.issue_date)") && list.includes("listDate(inv.due_date)"));
});

test("care plan fill: one dated line per visit day, under the week heading, recurring drafts the same", () => {
  const billing = readFileSync(new URL("./care-plan-billing.ts", import.meta.url), "utf8");
  const cron = readFileSync(new URL("./cron.ts", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../../components/invoicing/invoice-builder.tsx", import.meta.url), "utf8");
  assert.ok(billing.includes("service_date: day,"), "each line carries its visit day");
  assert.ok(billing.includes("period_start: sStart,") && billing.includes("period_end: sEnd,"), "the week heading stays");
  assert.ok(billing.includes("if (e.day_of_week !== dow) continue;"), "only that day's visits");
  assert.ok(cron.includes("service_date: l.service_date,"), "recurring care plan drafts are dated too");
  assert.ok(builder.includes("date: l.service_date ?? \"\","), "the Fill button puts the date in the box");
});

test("a paid invoice's payment can be changed: date and method, not in the future", () => {
  const actions = readFileSync(new URL("./invoice-actions.ts", import.meta.url), "utf8");
  assert.ok(actions.includes("export async function updateInvoicePayment"));
  assert.ok(actions.includes("The date paid cannot be in the future."));
  assert.ok(actions.includes('.eq("status", "paid")'));
  assert.ok(page.includes("action={updateInvoicePayment}"));
  assert.ok(page.includes('inv.status === "paid" ?'));
});
