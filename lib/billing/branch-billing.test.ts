/**
 * Extra branch billing arithmetic (THE LIST item 16).
 *
 * The pricing page has promised "£7.50 per extra branch per month" since launch and NOTHING
 * EVER BILLED FOR IT: EXTRA_BRANCH_PENCE existed only to be printed on a settings screen. Now
 * that a quantity is pushed to Stripe, the arithmetic behind that quantity is worth locking
 * down, because getting it wrong overcharges a customer rather than merely misreporting.
 *
 * lib/billing/seats.ts imports server-only code, so its allowances are read as TEXT here
 * rather than imported, the same trick lib/billing/price-consistency.test.ts uses. The rule
 * itself (extraBranchesFor) lives in the server-only stripe-sync.ts, so it is restated here
 * and asserted against the allowances the app actually ships.
 *
 * Run: node --experimental-strip-types --test lib/billing/branch-billing.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seats = readFileSync("lib/billing/seats.ts", "utf8");

/** A named number out of a source file. */
function constant(source: string, name: string): number {
  const m = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  assert.ok(m, `${name} not found`);
  return Number(m![1]);
}

/** The allowance each tier returns from includedBranchesForTier, read from the source. */
function includedBranches(tier: string): number {
  const body = seats.match(/includedBranchesForTier[\s\S]*?\n\}/);
  assert.ok(body, "includedBranchesForTier not found");
  const block = body![0];
  if (tier === "pro" || tier === "black") {
    const m = block.match(new RegExp(`case "${tier}":\\s*\\n\\s*return (\\d+)`));
    assert.ok(m, `no case for ${tier}`);
    return Number(m![1]);
  }
  // business and anything unknown fall through to the default.
  const m = block.match(/return (\d+); \/\/ business/);
  assert.ok(m, "no default branch allowance");
  return Number(m![1]);
}

/** The rule stripe-sync.ts pushes to Stripe, restated. */
function extraBranchesFor(branches: number, tier: string): number {
  return Math.max(0, branches - includedBranches(tier));
}

test("the allowances and the price are what the pricing page says", () => {
  assert.equal(includedBranches("business"), 1);
  assert.equal(includedBranches("pro"), 2);
  assert.equal(constant(seats, "EXTRA_BRANCH_PENCE"), 750);
});

// Acme exactly: Pro, two included, three operational branches. £7.50 shown to the customer
// and, until item 16, never collected.
test("a Pro company with three branches is charged for one", () => {
  assert.equal(extraBranchesFor(3, "pro"), 1);
});

test("a Business company's second branch is chargeable", () => {
  assert.equal(extraBranchesFor(2, "business"), 1);
  assert.equal(extraBranchesFor(1, "business"), 0);
});

// Never negative, or the quantity pushed to Stripe would be nonsense.
test("inside the allowance is nought, never a negative quantity", () => {
  assert.equal(extraBranchesFor(0, "pro"), 0);
  assert.equal(extraBranchesFor(2, "pro"), 0);
});

test("an unlimited tier never bills for a branch", () => {
  assert.equal(extraBranchesFor(50, "black"), 0);
});

// An unknown tier must fall to the SMALLEST allowance, so a new tier added without touching
// this file can never silently give branches away.
test("an unknown tier takes the default allowance", () => {
  assert.equal(includedBranches("something_new"), 1);
  assert.equal(extraBranchesFor(3, "something_new"), 2);
});
