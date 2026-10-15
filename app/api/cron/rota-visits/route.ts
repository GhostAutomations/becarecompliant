import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Nightly: make the next four weeks of visits from each Care Schedule, for every company with
 * Rota and Visits switched on (Stage 2, Phil 2026-10-15). Idempotent: a visit already made is
 * never made twice, and an allocated or published visit is flagged, never overwritten.
 *
 * Same auth as the other crons: fails CLOSED in production without CRON_SECRET (503), 401 on a
 * wrong secret. Returns 500 if any company's run failed, so a broken night is not reported as fine.
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

  const service = createServiceClient();
  const { data: companies, error } = await service.from("company_modules").select("company_id").eq("module", "rota_visits").eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const to = new Date(`${todayIso}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 27);
  const toIso = to.toISOString().slice(0, 10);

  const results: Record<string, unknown> = {};
  let failed = false;
  for (const c of (companies as { company_id: string }[] | null) ?? []) {
    const { data, error: runError } = await service.rpc("rota_generate_visits", { p_company: c.company_id, p_from: todayIso, p_to: toIso });
    if (runError) {
      failed = true;
      results[c.company_id] = { error: runError.message };
      console.error("[cron rota-visits]", c.company_id, runError.message);
    } else {
      results[c.company_id] = (data as unknown[] | null)?.[0] ?? null;
    }
  }
  return NextResponse.json({ from: todayIso, to: toIso, companies: results }, { status: failed ? 500 : 200 });
}
