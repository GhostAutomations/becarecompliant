import { NextRequest, NextResponse } from "next/server";
import { loadDmd } from "@/lib/dmd/import";

/**
 * Every Monday: fetch the newest NHS dm+d release from TRUD into our copy (Rota and Visits Stage 6,
 * decision 1). TRUD releases at 04:00 on Mondays and asks automated downloads to run on weekdays
 * between 08:00 and 18:00 or 00:00 and 06:00 UK time, so this runs at 09:00 UTC. A release already
 * loaded is skipped. Fails closed without CRON_SECRET; 500 when the load fails.
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
  const result = await loadDmd();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
