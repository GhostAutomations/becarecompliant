import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Daily: gives every goodwill credit that is due today or was missed (0472, Phil 2026-10-14;
 * docs/decisions/goodwill-credits.md). public.grant_due_goodwill does the work: each period is
 * claimed by a unique (grant, period) row before credits are added, so a second fire, two
 * overlapping runs or a manual Run in Vercel give nothing twice.
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

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("grant_due_goodwill", { p_grant_id: null });
  if (error) {
    console.error("[cron/goodwill-credits] failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ given: data ?? 0 });
}
