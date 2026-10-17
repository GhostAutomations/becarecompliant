import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { emailVisitAlerts } from "@/lib/rota/alert-email";

/**
 * Every minute: raise the late, missed and dose not recorded alerts (Rota and Visits Stage 7,
 * docs/decisions/rota-visits.md). The database decides everything (rota_alerts_run, once per visit
 * for each kind, only for companies with the module on) and tells people in the app; this then
 * sends any emails people asked for. Fails closed without CRON_SECRET; 500 when the run fails.
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
  const service = createServiceClient();
  const { data, error } = await service.rpc("rota_alerts_run");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const counts = ((data as { late: number; missed: number; doses: number }[] | null) ?? [])[0] ?? { late: 0, missed: 0, doses: 0 };
  const emailed = counts.late + counts.missed + counts.doses > 0 ? await emailVisitAlerts() : 0;
  return NextResponse.json({ ok: true, ...counts, emailed });
}
