import { NextRequest, NextResponse } from "next/server";
import { processCloudQueue } from "@/lib/cloud/worker";

/**
 * Every five minutes: copy anything still waiting into companies' cloud drives (0437). Most
 * copies are made straight after the event; this is the safety net for anything that was busy,
 * failed once, or was queued while a connection needed reconnecting.
 *
 * Same auth as the other crons: fails CLOSED in production without CRON_SECRET (503), 401 on a
 * wrong secret.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processCloudQueue({ limit: 200, budgetMs: 50_000 });
  return NextResponse.json({ ok: true, ...result });
}
