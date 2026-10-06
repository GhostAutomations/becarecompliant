import { NextRequest, NextResponse } from "next/server";
import { checkSources, syncLibrary } from "@/lib/policies/library-sync";

/**
 * Daily: re-check every policy guidance source last checked 28 or more days ago (Phil,
 * 2026-10-06). A changed source waits for the founder; companies see nothing until he approves.
 *
 * Same auth as every other cron: fails CLOSED in production without CRON_SECRET (503), 401 on a
 * wrong secret. A failed sync answers 500; a source that could not be fetched is reported in the
 * body and shown on the Founder library page, not treated as a failed run.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const synced = await syncLibrary();
  if (synced.error) {
    console.error("[cron/policy-sources] sync failed:", synced.error);
    return NextResponse.json({ error: synced.error }, { status: 500 });
  }
  const result = await checkSources();
  return NextResponse.json(result);
}
