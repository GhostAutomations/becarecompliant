import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/** RELATIVE, EXTENSIONED. */
import { verifyResendSignature } from "./webhook-signature.ts";

const SECRET = "whsec_" + Buffer.from("a-test-signing-key-not-a-real-one").toString("base64");
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });
const ID = "msg_2abc";
const NOW = new Date("2026-09-03T12:00:00Z");
const TS = String(Math.floor(NOW.getTime() / 1000));

function sign(body: string, id: string, ts: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

const good = () => ({
  rawBody: BODY,
  id: ID,
  timestamp: TS,
  signature: sign(BODY, ID, TS),
  secret: SECRET,
  now: NOW,
});

test("a genuine Resend delivery is accepted", () => {
  assert.deepEqual(verifyResendSignature(good()), { ok: true });
});

test("THE POINT OF THE WHOLE FUNCTION: a forged body is refused", () => {
  // Someone POSTs their own JSON with a signature captured from a real delivery.
  const tampered = { ...good(), rawBody: JSON.stringify({ type: "email.received", data: { email_id: "evil" } }) };
  const result = verifyResendSignature(tampered);
  assert.equal(result.ok, false);
});

test("no secret means refuse, never pass", () => {
  // A deploy that forgot the env var must reject events, not trust unsigned input.
  const result = verifyResendSignature({ ...good(), secret: "" });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /secret/i);
});

test("a signature made with a different secret is refused", () => {
  const other = "whsec_" + Buffer.from("a-completely-different-key-here").toString("base64");
  const result = verifyResendSignature({ ...good(), signature: sign(BODY, ID, TS, other) });
  assert.equal(result.ok, false);
});

test("missing headers are refused rather than skipped", () => {
  for (const missing of ["id", "timestamp", "signature"] as const) {
    const input = { ...good(), [missing]: null };
    const result = verifyResendSignature(input);
    assert.equal(result.ok, false, `${missing} missing should fail`);
  }
});

test("a replay from an hour ago is refused even though the signature is valid", () => {
  const oldTs = String(Math.floor(NOW.getTime() / 1000) - 3600);
  const result = verifyResendSignature({
    ...good(),
    timestamp: oldTs,
    signature: sign(BODY, ID, oldTs),
  });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /tolerance/i);
});

test("a timestamp from the future is refused too, not just an old one", () => {
  const futureTs = String(Math.floor(NOW.getTime() / 1000) + 3600);
  const result = verifyResendSignature({
    ...good(),
    timestamp: futureTs,
    signature: sign(BODY, ID, futureTs),
  });
  assert.equal(result.ok, false);
});

test("a nonsense timestamp is refused, not treated as zero", () => {
  const result = verifyResendSignature({ ...good(), timestamp: "not-a-number" });
  assert.equal(result.ok, false);
});

test("key rotation: several signatures offered, one correct, and it passes", () => {
  const other = "whsec_" + Buffer.from("the-previous-signing-key-value").toString("base64");
  const both = `${sign(BODY, ID, TS, other)} ${sign(BODY, ID, TS)}`;
  assert.deepEqual(verifyResendSignature({ ...good(), signature: both }), { ok: true });
});

test("a signature of the wrong length is refused without throwing", () => {
  // timingSafeEqual throws on differing lengths; the length check must come first.
  assert.doesNotThrow(() => verifyResendSignature({ ...good(), signature: "v1,short" }));
  assert.equal(verifyResendSignature({ ...good(), signature: "v1,short" }).ok, false);
});

test("a signature with no version prefix is still compared, not silently accepted", () => {
  const raw = sign(BODY, ID, TS).split(",")[1];
  assert.deepEqual(verifyResendSignature({ ...good(), signature: raw }), { ok: true });
  assert.equal(verifyResendSignature({ ...good(), signature: "notthesignature" }).ok, false);
});
