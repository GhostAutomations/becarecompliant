import { NextRequest, NextResponse } from "next/server";
import { runSetupOverdueAlerts } from "@/lib/setup/overdue-alert";

/**
 * Daily: the founder's 10 day "set up not finished" alert (Phil, 2026-10-01). Once per company,
 * claimed before sending, so a second fire or a manual Run in Vercel is harmless.
 *
 * Same auth as every other cron: fails CLOSED in production without CRON_SECRET (503), 401 on a
 * wrong secret. A failed run answers 500, never a quiet 200 (the retention cron lesson).
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

  const result = await runSetupOverdueAlerts(new Date());
  if (result.errors.length > 0) {
    console.error("[cron/setup-alert] failed:", result.errors.join(" | "));
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
