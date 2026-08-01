import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unitPricePence,
  unitPriceExactPence,
  lineAmountPence,
  type ServiceRate,
} from "../service-users/care-plan-consts.ts";
import { formatUnitPrice } from "./types.ts";

/**
 * THE RULE, settled 2026-08-01. A line amount is quantity billed at the TRUE rate, rounded once
 * at the end, and the invoice prints the UNROUNDED unit price so a client can multiply the two
 * printed figures and get the third.
 *
 * Phil asked why a drafted line read 7 x 15m = £44.63. It is right: seven quarter hours is 1.75
 * hours, and at £25.50 an hour that is £44.625. What was wrong was that £6.375 had nowhere to be
 * shown, so the only unit price in the app was the rounded £6.38, which multiplies to £44.66.
 * Charging the extra three pence to make the rounded figure true was considered and rejected: it
 * takes money off a care client to tidy up a display.
 */

/** Acme's live rate on 2026-08-01: care at £25.50 an hour. */
const CARE: ServiceRate = { label: "Care", hourly_pence: 2550, fixed_pence: 0 };
/** An ODD number of pence an hour. £25.50 quarters neatly onto a half penny, which hides a whole
 *  class of fault: quarter an odd rate and you land on a QUARTER penny. £22.75 is an ordinary
 *  care rate and its 15m visit is £5.6875. */
const ODD: ServiceRate = { label: "Care", hourly_pence: 2275, fixed_pence: 0 };
const SLEEP: ServiceRate = { label: "Sleep", hourly_pence: 0, fixed_pence: 18500 };

/** The pence a reader gets by multiplying the two figures PRINTED on the invoice. */
function pencePrinted(rate: ServiceRate, unit: string, handed: string, qty: number): number {
  const shown = formatUnitPrice(unitPriceExactPence(rate, unit, handed));
  return qty * Number(shown.replace("£", "").replace(/,/g, "")) * 100;
}

test("the line Phil asked about", () => {
  assert.equal(unitPriceExactPence(CARE, "15m", "single"), 637.5);
  assert.equal(lineAmountPence(CARE, "15m", "single", 7), 4463);
  assert.equal(formatUnitPrice(637.5), "£6.375");
});

test("the unit price AS PRINTED times the quantity gives the printed amount", () => {
  /*
   * The invariant the whole change exists to create, asserted against the STRING the invoice
   * shows rather than against the number behind it. Testing the number only proves two helpers
   * agree with each other; a reader with a calculator has nothing but the string.
   *
   * Rounding once at the end means the amount may sit half a penny off the raw product, which is
   * what "rounded to the penny" means. What it may never be is a whole penny off.
   */
  for (const rate of [CARE, ODD]) {
    for (const unit of ["15m", "30m", "45m", "1hr", "2hr", "3hr", "12hr"]) {
      for (const handed of ["single", "double"]) {
        for (const qty of [1, 3, 7, 14, 28, 56]) {
          const amount = lineAmountPence(rate, unit, handed, qty);
          const reader = pencePrinted(rate, unit, handed, qty);
          assert.ok(
            Math.abs(amount - reader) <= 0.5,
            `${rate.hourly_pence}p/hr, ${qty} x ${unit} ${handed}: amount ${amount} against a reader's ${reader}`,
          );
        }
      }
    }
  }
});

test("an odd hourly rate needs the fourth decimal", () => {
  // £22.75 an hour. A quarter of it is £5.6875, and printing £5.688 puts seven visits a penny
  // out. Three decimals was the first attempt and this is what caught it.
  assert.equal(unitPriceExactPence(ODD, "15m", "single"), 568.75);
  assert.equal(formatUnitPrice(568.75), "£5.6875");
  assert.equal(lineAmountPence(ODD, "15m", "single", 7), 3981);
});

test("the ROUNDED price is what would have been wrong, and by how much", () => {
  // Kept as the regression: this is the arithmetic a client would have done.
  assert.equal(unitPricePence(CARE, "15m", "single"), 638);
  assert.equal(7 * unitPricePence(CARE, "15m", "single") - lineAmountPence(CARE, "15m", "single", 7), 3);
});

test("units that divide exactly are untouched and print plainly", () => {
  assert.equal(lineAmountPence(CARE, "30m", "single", 28), 35700);
  assert.equal(lineAmountPence(CARE, "1hr", "double", 14), 71400);
  assert.equal(lineAmountPence(CARE, "3hr", "single", 2), 15300);
  assert.equal(formatUnitPrice(1275), "£12.75");
  assert.equal(formatUnitPrice(2550), "£25.50");
});

test("double handed doubles the exact price, not the rounded one", () => {
  assert.equal(unitPriceExactPence(CARE, "15m", "double"), 1275);
  assert.equal(lineAmountPence(CARE, "15m", "double", 7), 8925);
});

test("a Fixed service uses its flat fee and ignores the hourly rate", () => {
  assert.equal(unitPriceExactPence(SLEEP, "Fixed", "single"), 18500);
  assert.equal(lineAmountPence(SLEEP, "Fixed", "single", 3), 55500);
  assert.equal(lineAmountPence(SLEEP, "Fixed", "double", 1), 37000);
});

test("no rate, or an unknown unit, means no charge and never a NaN on an invoice", () => {
  assert.equal(unitPriceExactPence(undefined, "15m", "single"), 0);
  assert.equal(lineAmountPence(undefined, "15m", "single", 7), 0);
  assert.equal(unitPriceExactPence(CARE, "not a unit", "single"), 0);
  assert.equal(lineAmountPence(CARE, "not a unit", "single", 7), 0);
});

test("a fractional quantity still multiplies out", () => {
  // 45m of £25.50 is £19.125, which has no whole penny at all. Half a visit is not something the
  // builder offers, but the quantity box takes decimals, so it is worth pinning.
  assert.equal(unitPriceExactPence(CARE, "45m", "single"), 1912.5);
  assert.equal(lineAmountPence(CARE, "45m", "single", 1.5), 2869);
  assert.equal(formatUnitPrice(1912.5), "£19.125");
});

test("an old line prints an em dash on the invoice, and the rounded price on our own screens", () => {
  /*
   * Every invoice raised before migration 0163 has no exact price. The client document must not
   * print the rounded one: those invoices were sent when no unit price appeared at all, and a
   * Resend re-renders the PDF live, so £6.38 against £44.63 would put the original complaint in
   * front of a client who already has the invoice. Internal screens pass a fallback, where a
   * blank would help nobody.
   */
  assert.equal(formatUnitPrice(null), "—");
  assert.equal(formatUnitPrice(null, 638), "£6.38");
  assert.equal(formatUnitPrice(null, 7650), "£76.50");
});
