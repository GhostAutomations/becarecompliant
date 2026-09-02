import { NextRequest, NextResponse } from "next/server";
import { runTrialRequestChase } from "@/lib/founder/trial-chase";
import { isLondonSendHour } from "@/lib/notifications/digest";

/**
 * Daily chase for unanswered trial requests.
 *
 * Scheduled twice in vercel.json (06:00 and 07:00 UTC) for the same reason the digest is:
 * Vercel Cron is UTC only, and the London gate means exactly one of the two actually sends, so
 * it lands at 07:00 London in summer and winter. The per-request London-day stamp makes a
 * double fire harmless anyway.
 *
 * Same auth as every other cron: fails CLOSED in production without CRON_SECRET (503), 401 on a
 * wrong secret.
 *
 * A FAILED RUN MUST NOT LOOK LIKE A QUIET ONE — the retention cron taught us that (2026-08-11):
 * it swallowed an error into a JSON field, answered 200, and Vercel showed a healthy cron while
 * nothing had run for months. If the chase could not send, this answers 500.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isLondonSendHour(now)) {
    return NextResponse.json({ skipped: "before the London send hour" });
  }

  const result = await runTrialRequestChase(now);
  if (result.errors.length > 0) {
    console.error("[cron/trial-chase] failed:", result.errors.join(" | "));
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
