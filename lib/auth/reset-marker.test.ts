import { test } from "node:test";
import assert from "node:assert/strict";
import { isFreshResetSession, isResetSession, makeResetMarker, sessionIdOf } from "./reset-marker.ts";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-not-real";

const tokenFor = (sessionId: string) =>
  `x.${Buffer.from(JSON.stringify({ session_id: sessionId, amr: [{ method: "otp", timestamp: 1 }] })).toString("base64url")}.y`;

test("DEF-105: a reset link's session is recognised although Supabase calls it otp", async () => {
  const t0 = Date.UTC(2026, 9, 2, 1, 0, 0);
  const marker = await makeResetMarker("sess-1", t0);
  assert.ok(marker);
  assert.equal(sessionIdOf(tokenFor("sess-1")), "sess-1");
  assert.equal(await isFreshResetSession(marker, tokenFor("sess-1"), t0 + 60_000), true);
  // Past 15 minutes the form refuses it, but it is still a reset only session.
  assert.equal(await isFreshResetSession(marker, tokenFor("sess-1"), t0 + 16 * 60_000), false);
  assert.equal(await isResetSession(marker, tokenFor("sess-1"), t0 + 16 * 60_000), true);
});

test("DEF-105: a marker does not carry over to another session, and a forged one fails", async () => {
  const t0 = Date.UTC(2026, 9, 2, 1, 0, 0);
  const marker = await makeResetMarker("sess-1", t0);
  assert.equal(await isResetSession(marker, tokenFor("sess-2"), t0), false);
  assert.equal(await isResetSession(`${Math.floor(t0 / 1000)}.forged`, tokenFor("sess-1"), t0), false);
  assert.equal(await isResetSession(null, tokenFor("sess-1"), t0), false);
});
