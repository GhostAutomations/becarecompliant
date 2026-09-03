import { NextRequest, NextResponse } from "next/server";
import { verifyResendSignature } from "@/lib/founder/webhook-signature";
import { storeReceivedEmail } from "@/lib/founder/inbox-store";

/**
 * Resend inbound webhook: an email arrived at a receiving address on our domain.
 *
 * Security, and it is the whole job of this file:
 *  - Svix signature verified against the RAW body (request.text(), never a parsed body, exactly
 *    as the Stripe route does — re-serialising the JSON breaks the signature).
 *  - Fails CLOSED: no RESEND_WEBHOOK_SECRET returns 503 in production, so a misconfigured deploy
 *    rejects events rather than trusting whatever arrives.
 *  - Replay window of five minutes, so a captured delivery cannot be posted back next week.
 *  - This path sits under the /api/webhooks PUBLIC_PATHS prefix (no user session); the signature
 *    IS the auth.
 *
 * Idempotent: storeReceivedEmail dedupes on Resend's email id, backed by a unique index, so a
 * retry can never file the same message twice.
 *
 * ONE DELIBERATE ASYMMETRY. A signature failure answers 401 and stores nothing. A STORE failure
 * answers 500 so Resend retries — because Resend keeps received mail for only 30 days, a message
 * we failed to copy out is a message that eventually ceases to exist. Retrying is the whole
 * safety net.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();

  const check = verifyResendSignature({
    rawBody,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    secret,
  });
  if (!check.ok) {
    console.error("[webhook/resend-inbound] rejected:", check.reason);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body was not JSON" }, { status: 400 });
  }

  // Other event types (deliveries, bounces, opens) may point at this endpoint later. Answer 200
  // so Resend does not retry something we simply do not handle yet.
  if (event.type !== "email.received") {
    return NextResponse.json({ ignored: event.type ?? "unknown" });
  }

  const result = await storeReceivedEmail((event.data ?? {}) as Parameters<typeof storeReceivedEmail>[0]);

  if (!result.stored && result.reason && !result.reason.startsWith("Already stored")) {
    console.error("[webhook/resend-inbound] store failed:", result.reason);
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
