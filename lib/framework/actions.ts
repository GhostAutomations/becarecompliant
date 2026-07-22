"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getFrameworkReadiness } from "@/lib/framework/data";

/** Store today's readiness score per requirement (once per London day) so the
 *  trend builds. Safe to call on every page load; the unique key makes it idempotent. */
export async function captureReadinessSnapshot(): Promise<void> {
  const { profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) return;
  const supabase = await createClient();
  const { data: co } = await supabase
    .from("companies")
    .select("framework_enabled, regulator")
    .eq("id", companyId)
    .maybeSingle();
  if (!co?.framework_enabled) return;

  const regulator = (co.regulator ?? "ciw") as "cqc" | "ciw";
  const { requirements } = await getFrameworkReadiness(companyId, regulator);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const rows = requirements
    .filter((r) => r.score != null)
    .map((r) => ({ company_id: companyId, regulator, requirement_code: r.code, score: r.score, captured_on: today }));
  if (rows.length === 0) return;
  await supabase
    .from("framework_readiness_snapshots")
    .upsert(rows, { onConflict: "company_id,regulator,requirement_code,captured_on" });
}
