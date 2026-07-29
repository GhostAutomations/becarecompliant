/**
 * The prices on the website and the prices in the code must agree.
 *
 * WHY THIS TEST EXISTS. On 2026-07-29 the public pricing page said Pro was £69 while
 * TIER_BASE_PENCE said 9900, so Settings > Billing told a Pro customer £99 and the founder
 * revenue figures were £30 a month out for every Pro company. Nothing caught it, because a
 * price written in a marketing file and a price written in a config file have no way of
 * comparing notes. Now they do, and the build fails rather than the customer finding out.
 *
 * lib/stripe/config.ts and lib/billing/seats.ts both import server-only code, so they are
 * read as TEXT here rather than imported, the same trick lib/ui/save-button.test.ts uses on
 * globals.css. lib/marketing/tiers.ts is pure, so it is imported properly.
 *
 * Stripe itself is the third place a price lives, and a test has no key for a live account.
 * That half is checked at runtime by lib/billing/price-check.ts on the founder health screen.
 *
 * Run: node --experimental-strip-types --test lib/billing/price-consistency.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRICING_TIERS, PRICING_FOOTNOTE } from "../marketing/tiers.ts";

const config = readFileSync("lib/stripe/config.ts", "utf8");
const seats = readFileSync("lib/billing/seats.ts", "utf8");

/** "£69" or "£7.50" from customer-facing copy, in pence. */
function poundsToPence(text: string): number {
  const m = text.match(/£\s*(\d+)(?:\.(\d{1,2}))?/);
  assert.ok(m, `No price found in ${JSON.stringify(text)}`);
  const pounds = Number(m![1]);
  const pennies = m![2] ? Number(m![2].padEnd(2, "0")) : 0;
  return pounds * 100 + pennies;
}

/** A named number out of a source file, e.g. TIER_BASE_PENCE's `pro: 6900,`. */
function constant(source: string, name: string): number {
  const m = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  assert.ok(m, `${name} not found`);
  return Number(m![1]);
}

function tierBasePence(tier: string): number {
  const block = config.match(/TIER_BASE_PENCE[^{]*\{([^}]*)\}/);
  assert.ok(block, "TIER_BASE_PENCE block not found in lib/stripe/config.ts");
  const m = block![1].match(new RegExp(`${tier}\\s*:\\s*(\\d+)`));
  assert.ok(m, `${tier} not found in TIER_BASE_PENCE`);
  return Number(m![1]);
}

test("every public plan price matches TIER_BASE_PENCE", () => {
  for (const tier of PRICING_TIERS) {
    assert.equal(
      tierBasePence(tier.key),
      poundsToPence(tier.price),
      `The website sells ${tier.name} at ${tier.price} but TIER_BASE_PENCE says ${tierBasePence(tier.key)} pence. Fix the code AND the Stripe price, not just one of them.`,
    );
  }
});

test("the extra user price on the website matches EXTRA_SEAT_PENCE", () => {
  const m = PRICING_FOOTNOTE.match(/extra users are (£[\d.]+)/i);
  assert.ok(m, "The footnote no longer states the extra user price");
  assert.equal(poundsToPence(m![1]), constant(seats, "EXTRA_SEAT_PENCE"));
});

test("the extra branch price on the website matches EXTRA_BRANCH_PENCE", () => {
  const m = PRICING_FOOTNOTE.match(/Extra branches are (£[\d.]+)/i);
  assert.ok(m, "The footnote no longer states the extra branch price");
  assert.equal(poundsToPence(m![1]), constant(seats, "EXTRA_BRANCH_PENCE"));
});

test("the AI top up on the website matches AI_TOPUP_CREDITS and AI_TOPUP_PENCE", () => {
  const m = PRICING_FOOTNOTE.match(/(\d+) more cost (£[\d.]+)/i);
  assert.ok(m, "The footnote no longer states the AI top up");
  assert.equal(Number(m![1]), constant(config, "AI_TOPUP_CREDITS"));
  assert.equal(poundsToPence(m![2]), constant(config, "AI_TOPUP_PENCE"));
});

test("the two public plans are the two the billing code can actually sell", () => {
  for (const tier of PRICING_TIERS) {
    assert.match(
      config,
      new RegExp(`STRIPE_PRICE_${tier.key.toUpperCase()}`),
      `${tier.name} is on sale on the website but has no Stripe price id in the config`,
    );
  }
});
