import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Resend (Svix) webhook signature.
 *
 * NO APP IMPORTS — node:crypto only, so it can be unit tested. That matters more here than
 * anywhere else in this codebase: this function is the only thing standing between a public
 * endpoint and a stranger writing rows into the founder's inbox.
 *
 * Written by hand rather than pulling in the SDK, matching lib/email/resend.ts (no SDK for
 * sending either) and the Stripe webhook's raw-body discipline.
 *
 * Signed content is `id.timestamp.rawBody`. The secret is base64 after the `whsec_` prefix. The
 * header carries a space separated list of `v1,<signature>` — a list, because Svix supports key
 * rotation, so ANY matching entry passes.
 *
 * THE RAW BODY MATTERS: re-serialising the JSON changes a byte and nothing will ever match.
 * Callers must pass request.text(), exactly as the Stripe route does.
 */
export type SignatureCheck = { ok: true } | { ok: false; reason: string };

export function verifyResendSignature(input: {
  rawBody: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}): SignatureCheck {
  const { rawBody, id, timestamp, signature, secret } = input;
  if (!secret) return { ok: false, reason: "No webhook secret configured" };
  if (!id || !timestamp || !signature) return { ok: false, reason: "Missing svix headers" };

  // A replayed request from last week is refused even with a valid signature.
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "Bad svix-timestamp" };
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(now - sent) > tolerance) return { ok: false, reason: "Timestamp outside tolerance" };

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  const offered = signature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(",") ? part.slice(part.indexOf(",") + 1) : part));

  const expectedBuf = Buffer.from(expected);
  const matched = offered.some((candidate) => {
    const buf = Buffer.from(candidate);
    // Length first: timingSafeEqual THROWS on differing lengths rather than returning false.
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });

  return matched ? { ok: true } : { ok: false, reason: "Signature did not match" };
}
