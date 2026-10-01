import "server-only";

/**
 * The "Getting set up" card's data (0366). Reads through get_setup_status, which only the
 * company's Admin or the founder may call, and writes the "saved once" stamps with the service
 * client from server actions that have already passed their own permission check.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBranchTerms } from "@/lib/branches/company-word";
import { tierHasFeature } from "@/lib/billing/tier";
import type { Tier } from "@/lib/stripe/config";
import { buildSetupSteps, setupProgress, type SetupGroup, type SetupStatus } from "./getting-set-up";

export type SetupCard = { groups: SetupGroup[]; settled: number; total: number; finished: boolean };

export async function getSetupCard(companyId: string): Promise<SetupCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_setup_status", { p_company: companyId });
  if (error || !data) return null;
  const status = data as SetupStatus;
  const terms = await getBranchTerms(companyId);
  const groups = buildSetupSteps(status, {
    one: terms.one,
    many: terms.many,
    regulatorName: status.regulator === "ciw" ? "CIW" : status.regulator === "cqc" ? "CQC" : null,
    hasFormBuilder: tierHasFeature(status.tier as Tier, "form_builder"),
  });
  return { groups, ...setupProgress(groups) };
}

/**
 * Stamp a step as done because its settings page was saved. Best effort: a failure here must
 * never fail the save the person just made, so it is swallowed (and logged).
 * Done beats an earlier Not needed: the person looked after all.
 */
export async function recordSetupDone(companyId: string, stepKey: string, by: string | null): Promise<void> {
  try {
    const admin = createServiceClient();
    const { error } = await admin
      .from("company_setup_steps")
      .upsert({ company_id: companyId, step_key: stepKey, state: "done", by, at: new Date().toISOString() }, {
        onConflict: "company_id,step_key",
      });
    if (error) console.error("recordSetupDone", stepKey, error.message);
  } catch (e) {
    console.error("recordSetupDone", stepKey, e);
  }
}
