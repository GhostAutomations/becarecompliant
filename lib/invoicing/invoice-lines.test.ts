import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unitPricePence,
  lineAmountPence,
  type ServiceRate,
} from "../service-users/care-plan-consts.ts";
import { formatUnitPrice, lineAddsUp, showsUnitPrice } from "./types.ts";

/**
 * THE RULE, settled 2026-08-01 after three goes at it.
 *
 * A line is charged at QUANTITY x THE PRINTED UNIT PRICE, both rounded to the penny, so a client
 * with a calculator can reproduce every figure on the invoice.
 *
 * The two rejected answers are worth keeping written down. Billing at the exact hourly rate and
 * rounding once at the end gave 7 x 15m = £44.63, which is arithmetically purer and which nobody
 * reading the invoice can check, because 7 x £6.38 is £44.66. Printing £6.375 to make that true
 * was built and then thrown out: three decimal places read as a spreadsheet artefact on a care
 * invoice. What is left costs a few pence a line on quarter hour visits and reads properly.
 */

/** Acme's live rate on 2026-08-01: care at £25.50 an hour. */
const CARE: ServiceRate = { label: "Care", hourly_pence: 2550, fixed_pence: 0 };
/** An ODD number of pence an hour. £25.50 quarters onto a half penny, which hides a whole class
 *  of fault; quarter an odd rate and you land on a quarter penny. */
const ODD: ServiceRate = { label: "Care", hourly_pence: 2275, fixed_pence: 0 };
const SLEEP: ServiceRate = { label: "Sleep", hourly_pence: 0, fixed_pence: 18500 };

test("the line Phil asked about", () => {
  assert.equal(unitPricePence(CARE, "15m", "single"), 638);
  assert.equal(lineAmountPence(CARE, "15m", "single", 7), 4466);
});

test("every line multiplies out, which is the whole point", () => {
  for (const rate of [CARE, ODD]) {
    for (const unit of ["15m", "30m", "45m", "1hr", "2hr", "3hr", "12hr"]) {
      for (const handed of ["single", "double"]) {
        for (const qty of [1, 3, 7, 14, 28, 56]) {
          const price = unitPricePence(rate, unit, handed);
          const amount = lineAmountPence(rate, unit, handed, qty);
          assert.equal(amount, qty * price, `${qty} x ${unit} ${handed} at ${rate.hourly_pence}p/hr`);
          assert.equal(lineAddsUp({ quantity: qty, unit_price_pence: price, line_total_pence: amount }), true);
        }
      }
    }
  }
});

test("units that divide exactly are untouched by any of this", () => {
  // These were right under every version of the rule and must never move.
  assert.equal(lineAmountPence(CARE, "30m", "single", 28), 35700);
  assert.equal(lineAmountPence(CARE, "1hr", "double", 14), 71400);
  assert.equal(lineAmountPence(CARE, "3hr", "single", 2), 15300);
});

test("double handed rounds before it doubles, so the printed price is the billed price", () => {
  assert.equal(unitPricePence(CARE, "15m", "double"), 1276);
  assert.equal(lineAmountPence(CARE, "15m", "double", 7), 8932);
});

test("a Fixed service uses its flat fee and ignores the hourly rate", () => {
  assert.equal(unitPricePence(SLEEP, "Fixed", "single"), 18500);
  assert.equal(lineAmountPence(SLEEP, "Fixed", "single", 3), 55500);
  assert.equal(lineAmountPence(SLEEP, "Fixed", "double", 1), 37000);
});

test("no rate, or an unknown unit, means no charge and never a NaN on an invoice", () => {
  assert.equal(unitPricePence(undefined, "15m", "single"), 0);
  assert.equal(lineAmountPence(undefined, "15m", "single", 7), 0);
  assert.equal(unitPricePence(CARE, "not a unit", "single"), 0);
  assert.equal(lineAmountPence(CARE, "not a unit", "single", 7), 0);
});

test("a line written under the OLD rule is spotted from the row itself", () => {
  // 7 x 15m as it was stored before 2026-08-01: charged at the exact rate, three pence adrift of
  // its own printed price. No flag, no column, no migration: the arithmetic says so.
  assert.equal(lineAddsUp({ quantity: 7, unit_price_pence: 638, line_total_pence: 4463 }), false);
  assert.equal(formatUnitPrice({ quantity: 7, unit_price_pence: 638, line_total_pence: 4463 }), "—");
  // The old 30m and 1hr lines DO hold, and are printed, because they were never wrong.
  assert.equal(lineAddsUp({ quantity: 28, unit_price_pence: 1275, line_total_pence: 35700 }), true);
  assert.equal(formatUnitPrice({ quantity: 28, unit_price_pence: 1275, line_total_pence: 35700 }), "£12.75");
});

test("the Unit price column appears only when EVERY line stands being multiplied out", () => {
  // An invoice from before the change: no column at all, so it renders as it was sent.
  assert.equal(showsUnitPrice([{ quantity: 7, unit_price_pence: 638, line_total_pence: 4463 }]), false);
  assert.equal(showsUnitPrice([]), false);

  /*
   * THE ONE REVIEW CAUGHT. A pre 2026-08-01 invoice usually holds a mix: its 30m and 1hr lines
   * divide exactly and hold, its 15m lines do not. Under a "some" rule that invoice grew a half
   * filled column it was never sent with, and the PDF is rendered live on every Resend, so the
   * client would receive a different document from the one they hold. Mixed means hidden.
   */
  assert.equal(
    showsUnitPrice([
      { quantity: 7, unit_price_pence: 638, line_total_pence: 4463 },
      { quantity: 2, unit_price_pence: 7650, line_total_pence: 15300 },
    ]),
    false,
  );
  // All good, so the column shows.
  assert.equal(
    showsUnitPrice([
      { quantity: 7, unit_price_pence: 638, line_total_pence: 4466 },
      { quantity: 2, unit_price_pence: 7650, line_total_pence: 15300 },
    ]),
    true,
  );
  // A free line is a real line: zero times anything is zero, so it holds and prints £0.00.
  assert.equal(formatUnitPrice({ quantity: 4, unit_price_pence: 0, line_total_pence: 0 }), "£0.00");
});

/*
 * NOT TESTED HERE, and worth knowing: buildCarePlanLines, which produces most real invoices.
 * It has runtime imports of "./types" and "@/lib/service-users/care-plan-consts", and this
 * harness is `node --experimental-strip-types --test` with no path aliases and no extensionless
 * resolution, so it cannot be loaded. What IS pinned is the arithmetic it delegates to, over
 * every unit, both handed values and a range of quantities, above.
 */

test("a fractional quantity is charged at the printed price like any other", () => {
  assert.equal(unitPricePence(CARE, "45m", "single"), 1913);
  assert.equal(lineAmountPence(CARE, "45m", "single", 1.5), 2870);
  assert.equal(lineAddsUp({ quantity: 1.5, unit_price_pence: 1913, line_total_pence: 2870 }), true);
});
