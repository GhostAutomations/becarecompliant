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

// 0161 is the LIVE definition of the allowance: 0159 created it against five tiers, and the
// tier list was cut to three on 31 Jul. Reading the newest one is the point of this test.
const migration = readFileSync(
  new URL("../../supabase/migrations/0161_three_tiers_business_pro_black.sql", import.meta.url),
  "utf8",
);
const billingPage = readFileSync(
  new URL("../../app/(app)/settings/billing/page.tsx", import.meta.url),
  "utf8",
);
const stripeConfig = readFileSync(new URL("../stripe/config.ts", import.meta.url), "utf8");

/** The bundle each tier gets every month. Three tiers: the two you sell, plus free Black. */
const BUNDLES: Array<[string, number]> = [
  ["business", 0],
  ["pro", 100],
  ["black", 2000],
];

test("the database grants the agreed bundle for every tier", () => {
  // Scoped to the SMS function's own body. The migration also defines the AI allowance, and an
  // unscoped match could be satisfied by an AI number while claiming to have checked SMS.
  const body = migration.match(
    /create or replace function public\.tier_monthly_sms_credits[\s\S]*?\$\$;/,
  );
  assert.ok(body, "tier_monthly_sms_credits is not defined in the migration this test reads");
  for (const [tier, texts] of BUNDLES) {
    assert.match(
      body![0],
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
