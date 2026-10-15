"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getFrameworkReadiness } from "@/lib/framework/data";
import { maySnapshotReadiness } from "@/lib/framework/roles";
import { storeReadinessSnapshot } from "@/lib/framework/snapshot";

/** Store today's readiness score per requirement (once per London day) so the
 *  trend builds. Safe to call on every page load; the unique key makes it idempotent.
 *
 *  Only the roles that open Inspection Readiness store scores, and a Branch Manager only their
 *  own branch's (audit F53, Phil 11 Oct 2026; the database refuses anything else). The first
 *  open of the day is what is kept: a stored score is changed only by the Founder, so a later
 *  open the same day leaves today's row as it is rather than being refused. */
export async function captureReadinessSnapshot(branchId: string | null = null): Promise<void> {
  const { profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) return;
  if (!maySnapshotReadiness(profile.role, branchId)) return;
  const supabase = await createClient();
  const { data: co } = await supabase
    .from("companies")
    .select("framework_enabled, regulator")
    .eq("id", companyId)
    .maybeSingle();
  if (!co?.framework_enabled) return;

  const regulator = (co.regulator ?? "ciw") as "cqc" | "ciw";
  if (branchId) {
    // The branch comes from the page, so it must be one of this company's.
    const { data: b } = await supabase.from("branches").select("id").eq("id", branchId).eq("company_id", companyId).maybeSingle();
    if (!b) return;
  }
  const { requirements } = await getFrameworkReadiness(companyId, regulator, branchId);
  await storeReadinessSnapshot(supabase, companyId, regulator, branchId, requirements);
}
