import "server-only";

/**
 * Be Care Compliant — write the weekly Care Plan from a completed Setup Visit.
 *
 * Phil, 2026-09-09: the calls asked for at the setup visit are "what will be billed in
 * invoicing", so they land in care_plan_entries, which is what Invoicing bills from. Not a
 * second copy kept alongside it: one set of facts, in the place that already reads them.
 *
 * NEVER OVERWRITES A PLAN THAT EXISTS. If the service user already has an open care plan —
 * typed in the grid, or seeded by an earlier Setup Visit — this does nothing at all. A visit
 * re-done or corrected months later must not silently replace a plan somebody has since
 * adjusted, and quietly changing what a customer bills is the worst thing this could do.
 *
 * SERVICE ROLE, for the same reason as the private invoicing flag: a Supervisor can complete a
 * Setup Visit but cannot necessarily write care_plan_entries, and a silent refusal would leave
 * a package with no plan and nothing on screen to say why.
 *
 * BEST EFFORT: the Setup Visit is Evidence and must not fail because the billing side did.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { Answers } from "@/lib/form-schema";
import { callsFromSetupAnswers, carePlanRowsFromCalls, describeCalls } from "./setup-calls";

export async function seedCarePlanFromSetup(opts: {
  companyId: string;
  serviceUserId: string;
  answers: Answers;
  /** The day the setup visit happened: when this plan starts billing from. */
  effectiveFrom: string;
}): Promise<{ seeded: number; summary: string | null }> {
  if (opts.answers["care_plan_in_place"] !== "yes") return { seeded: 0, summary: null };

  const calls = callsFromSetupAnswers(opts.answers);
  if (calls.length === 0) return { seeded: 0, summary: null };

  try {
    const admin = createServiceClient();

    const { data: existing } = await admin
      .from("care_plan_entries")
      .select("id")
      .eq("service_user_id", opts.serviceUserId)
      .is("effective_to", null)
      .limit(1);
    if (existing && existing.length > 0) return { seeded: 0, summary: null };

    const rows = carePlanRowsFromCalls(calls).map((r) => ({
      company_id: opts.companyId,
      service_user_id: opts.serviceUserId,
      day_of_week: r.day_of_week,
      service: r.service,
      unit: r.unit,
      handed: r.handed,
      carers: r.handed === "double" ? 2 : 1,
      quantity: r.quantity,
      position: r.position,
      effective_from: opts.effectiveFrom,
    }));

    const { error } = await admin.from("care_plan_entries").insert(rows);
    if (error) {
      console.error("[seedCarePlanFromSetup] failed:", error.message);
      return { seeded: 0, summary: null };
    }
    return { seeded: rows.length, summary: describeCalls(calls) };
  } catch (e) {
    console.error("[seedCarePlanFromSetup] failed:", (e as Error).message);
    return { seeded: 0, summary: null };
  }
}
