import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { showsUnitPrice } from "./types.ts";

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
  assert.deepEqual(order(head), ["service", "unit", "handed", "qty", "price", "amount"]);
  assert.deepEqual(order(row), order(head));
});

test("the week separator spans exactly the number of headings there are", () => {
  const headings = [...page.matchAll(/<th[\s\S]*?>([^<]+)<\/th>/g)].map((m) => m[1].trim());
  assert.deepEqual(headings, ["Service", "Unit", "Handed", "Qty", "Unit price", "Amount"]);
  // Six headings with the price column, five without, and the colSpan must say so.
  assert.ok(
    page.includes("colSpan={showPrice ? 6 : 5}"),
    "the week separator colSpan no longer matches the heading count",
  );
});

test("an invoice of only pre 2026-08-01 lines shows no column at all", () => {
  // 7 x £6.38 is £44.66, and that line was stored at £44.63, so it does not stand being
  // multiplied out and the column goes with it.
  assert.equal(showsUnitPrice([{ quantity: 7, unit_price_pence: 638, line_total_pence: 4463 }]), false);
});
