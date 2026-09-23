import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORGOT_REPLY,
  RESET_THROTTLE_MINUTES,
  canReceiveReset,
  cameFromRecovery,
  amrFromAccessToken,
  isRecoverySession,
  RECOVERY_WINDOW_MINUTES,
  looksLikeEmail,
  newPasswordProblem,
  normaliseEmail,
  resetThrottled,
} from "./password-reset-rules.ts";

test("addresses are compared the way they are stored", () => {
  assert.equal(normaliseEmail("  Phil@ThistleCareWales.co.uk "), "phil@thistlecarewales.co.uk");
  assert.equal(normaliseEmail(null), "");
});

test("only something shaped like an address is looked up", () => {
  assert.equal(looksLikeEmail("a@b.co"), true);
  assert.equal(looksLikeEmail("not an email"), false);
  assert.equal(looksLikeEmail(""), false);
});

test("only a live account can be sent a reset", () => {
  assert.equal(canReceiveReset("active"), true);
  // Never set a password: their invitation is the door, not a reset.
  assert.equal(canReceiveReset("invited"), false);
  // Switched off by an Admin: a reset must not look like the switch was undone.
  assert.equal(canReceiveReset("disabled"), false);
  assert.equal(canReceiveReset(null), false);
});

test("one reset per account per throttle window", () => {
  const now = Date.parse("2026-09-23T10:00:00Z");
  assert.equal(resetThrottled(null, now), false);
  assert.equal(resetThrottled("2026-09-23T09:55:00Z", now), true);
  const edge = new Date(now - RESET_THROTTLE_MINUTES * 60_000).toISOString();
  assert.equal(resetThrottled(edge, now), false);
  assert.equal(resetThrottled("rubbish", now), false);
});

test("the new password rule matches the invitation's", () => {
  assert.match(newPasswordProblem("short", "short") ?? "", /at least 8/);
  assert.match(newPasswordProblem("longenough1", "longenough2") ?? "", /do not match/);
  assert.equal(newPasswordProblem("longenough1", "longenough1"), null);
});

test("the public reply gives nothing away and has no dashes", () => {
  // One sentence for every outcome, so the form cannot be used to find out who has an account.
  assert.ok(!/not found|no account|disabled|too many/i.test(FORGOT_REPLY));
  assert.ok(!/[–—]/.test(FORGOT_REPLY));
});

test("the new password form is only for a session that has just come from a reset link", () => {
  const now = Date.parse("2026-09-23T01:00:00Z");
  const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  // Just opened the link.
  assert.equal(cameFromRecovery([{ method: "recovery", timestamp: secs("2026-09-23T00:58:00Z") }], now), true);
  // An ordinary sign in: somebody at an unlocked computer must not be able to take the account over.
  assert.equal(cameFromRecovery([{ method: "password", timestamp: secs("2026-09-23T00:59:00Z") }], now), false);
  assert.equal(cameFromRecovery([], now), false);
  // A reset link opened long ago does not stay a licence to change the password.
  const stale = new Date(now - (RECOVERY_WINDOW_MINUTES + 1) * 60_000).toISOString();
  assert.equal(cameFromRecovery([{ method: "recovery", timestamp: secs(stale) }], now), false);
});

test("the sign in method is read out of a real shaped token", () => {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = `${b64url({ alg: "HS256" })}.${b64url({ amr: [{ method: "recovery", timestamp: 1790000000 }], sub: "x" })}.sig`;
  assert.deepEqual(amrFromAccessToken(token), [{ method: "recovery", timestamp: 1790000000 }]);
  assert.deepEqual(amrFromAccessToken("not a token"), []);
  assert.deepEqual(amrFromAccessToken(null), []);
});

test("a reset link session is recognised, an ordinary one is not", () => {
  assert.equal(isRecoverySession([{ method: "recovery" }]), true);
  assert.equal(isRecoverySession([{ method: "password" }]), false);
  assert.equal(isRecoverySession([{ method: "invite" }]), false);
  assert.equal(isRecoverySession([]), false);
});
