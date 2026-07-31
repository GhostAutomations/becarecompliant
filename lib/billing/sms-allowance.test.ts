import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The SMS allowance lives in THREE places: the database function that grants it, the constant the
 * Billing page prints, and the tile that counts down against it. They must agree.
 *
 * This is the same class of bug as the £69 that was £99 in Stripe: a number stated in two places
 * drifts, and the first anyone knows is a customer reading one figure while being charged
 * another. A test can check it; prose cannot.
 */

const migration = readFileSync(
  new URL("../../supabase/migrations/0159_sms_credits.sql", import.meta.url),
  "utf8",
);
const billingPage = readFileSync(
  new URL("../../app/(app)/settings/billing/page.tsx", import.meta.url),
  "utf8",
);
const stripeConfig = readFileSync(new URL("../stripe/config.ts", import.meta.url), "utf8");

/** The bundle each tier gets every month, as agreed on 2026-07-31. */
const BUNDLES: Array<[string, number]> = [
  ["business", 0],
  ["pro", 100],
  ["enterprise", 250],
  ["diamond", 500],
  ["black", 2000],
];

test("the database grants the agreed bundle for every tier", () => {
  for (const [tier, texts] of BUNDLES) {
    assert.match(
      migration,
      new RegExp(`when '${tier}' then ${texts}\\b`),
      `tier_monthly_sms_credits no longer grants ${tier} ${texts} texts`,
    );
  }
});

test("the Billing page prints the same bundle the database grants", () => {
  const m = billingPage.match(/const SMS_ALLOWANCE: Record<string, number> = \{([^}]+)\}/);
  assert.ok(m, "The Billing page no longer states the SMS allowance");
  for (const [tier, texts] of BUNDLES) {
    assert.match(
      m![1],
      new RegExp(`${tier}: ${texts}\\b`),
      `Billing shows a different allowance for ${tier} than the database grants`,
    );
  }
});

test("an SMS top up bundle is a real number of texts at a real price", () => {
  const credits = stripeConfig.match(/export const SMS_TOPUP_CREDITS = (\d+)/);
  const pence = stripeConfig.match(/export const SMS_TOPUP_PENCE = (\d+)/);
  assert.ok(credits && pence, "The SMS top up constants are gone");
  assert.ok(Number(credits![1]) > 0);
  // Sanity, not pricing policy: a UK text costs about 4p to send, so anything at or below cost
  // is a mistake rather than a decision.
  const perTextPence = Number(pence![1]) / Number(credits![1]);
  assert.ok(perTextPence > 4, `A top up text is priced at ${perTextPence}p, at or below what it costs to send`);
});
