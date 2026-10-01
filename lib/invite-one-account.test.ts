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

import { activeLoginHere, activeLoginRefusal } from "./invite-one-account.ts";

test("DEF-102: an active login in the same company is refused", () => {
  assert.equal(activeLoginHere({ existingCompanyId: "a", existingStatus: "active", targetCompanyId: "a" }), true);
});
test("DEF-102: an invited profile (resend) and a leaver (rejoin) are allowed", () => {
  assert.equal(activeLoginHere({ existingCompanyId: "a", existingStatus: "invited", targetCompanyId: "a" }), false);
  assert.equal(activeLoginHere({ existingCompanyId: "a", existingStatus: "disabled", targetCompanyId: "a" }), false);
});
test("DEF-102: another company or no account is not this check", () => {
  assert.equal(activeLoginHere({ existingCompanyId: "b", existingStatus: "active", targetCompanyId: "a" }), false);
  assert.equal(activeLoginHere({ existingCompanyId: null, existingStatus: null, targetCompanyId: "a" }), false);
});
test("DEF-102: the refusal names the person and has no dashes", () => {
  assert.match(activeLoginRefusal("Bev Admin"), /^Bev Admin already has a login here/);
  assert.doesNotMatch(activeLoginRefusal("Bev Admin"), /[—–]/);
});
