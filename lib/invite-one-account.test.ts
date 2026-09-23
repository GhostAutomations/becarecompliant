import test from "node:test";
import assert from "node:assert/strict";
import { belongsToAnotherCompany, ONE_ACCOUNT_REFUSAL } from "./invite-one-account.ts";

const B = "company-b";

test("a fresh address, or one already in this company, is fine", () => {
  assert.equal(belongsToAnotherCompany({ existingCompanyId: null, existingCompanyStatus: null, targetCompanyId: B }), false);
  assert.equal(belongsToAnotherCompany({ existingCompanyId: B, existingCompanyStatus: "active", targetCompanyId: B }), false);
});

test("DEF-009: an address in another live company is refused, whatever the account's own state", () => {
  assert.equal(belongsToAnotherCompany({ existingCompanyId: "company-a", existingCompanyStatus: "active", targetCompanyId: B }), true);
  assert.equal(belongsToAnotherCompany({ existingCompanyId: "company-a", existingCompanyStatus: "suspended", targetCompanyId: B }), true);
});

test("a deleted or purged company no longer holds the address", () => {
  assert.equal(belongsToAnotherCompany({ existingCompanyId: "company-a", existingCompanyStatus: "deleted", targetCompanyId: B }), false);
  assert.equal(belongsToAnotherCompany({ existingCompanyId: "company-a", existingCompanyStatus: null, targetCompanyId: B }), false);
});

test("the refusal says what to do, with no dashes", () => {
  assert.match(ONE_ACCOUNT_REFUSAL, /use a different email address/);
  assert.ok(!/[–—]/.test(ONE_ACCOUNT_REFUSAL));
});
