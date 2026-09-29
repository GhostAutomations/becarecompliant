import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingOfferActive, ONBOARDING_FEE, ONBOARDING_FEE_PENCE, OFFER_HEADLINE } from "./offer.ts";
import { PRICING_TIERS, PRICING_FOOTNOTE } from "./tiers.ts";

test("the offer runs to 31 December 2026 inclusive and stops on 1 January 2027", () => {
  assert.equal(onboardingOfferActive("2026-09-29"), true);
  assert.equal(onboardingOfferActive("2026-12-31"), true);
  assert.equal(onboardingOfferActive("2027-01-01"), false);
});

test("the fee in words and in pence agree", () => {
  assert.equal(Number(ONBOARDING_FEE.replace(/[^\d]/g, "")) * 100, ONBOARDING_FEE_PENCE);
});

test("annual is ten months of the monthly price, and says so", () => {
  const pence = (s: string) => Number(s.replace(/[^\d]/g, "")) * 100;
  for (const t of PRICING_TIERS) {
    assert.equal(pence(t.annualPrice), pence(t.price) * 10, `${t.name} annual is not ten months`);
    assert.equal(pence(t.annualSaving), pence(t.price) * 2, `${t.name} annual saving is not two months`);
  }
  assert.match(PRICING_FOOTNOTE, /Annual plans/);
});

test("no dashes in the customer facing offer copy", () => {
  assert.doesNotMatch(OFFER_HEADLINE, /[–—]| - /);
});
