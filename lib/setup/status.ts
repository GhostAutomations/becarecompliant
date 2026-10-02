import "server-only";

/**
 * The "Getting set up" card's data (0366). Reads through get_setup_status, which only the
 * company's Admin or the founder may call, and writes the "saved once" stamps with the service
 * client from server actions that have already passed their own permission check.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBranchTerms } from "@/lib/branches/company-word";
import { branchTerms, branchWord } from "@/lib/branches/word";
import { legalPublished } from "@/lib/legal/documents";
import { tierHasFeature } from "@/lib/billing/tier";
import type { Tier } from "@/lib/stripe/config";
import { buildSetupSteps, setupProgress, type SetupGroup, type SetupStatus } from "./getting-set-up";

export type SetupCard = { groups: SetupGroup[]; settled: number; total: number; finished: boolean };

function cardFromStatus(status: SetupStatus, terms: { one: string; many: string }): SetupCard {
  const groups = buildSetupSteps(status, {
    one: terms.one,
    many: terms.many,
    regulatorName: status.regulator === "ciw" ? "CIW" : status.regulator === "cqc" ? "CQC" : null,
    hasFormBuilder: tierHasFeature(status.tier as Tier, "form_builder"),
    legalPublished: legalPublished(),
  });
  return { groups, ...setupProgress(groups) };
}

export async function getSetupCard(companyId: string): Promise<SetupCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_setup_status", { p_company: companyId });
  if (error || !data) return null;
  return cardFromStatus(data as SetupStatus, await getBranchTerms(companyId));
}

/**
 * The same card read with the service client, for the daily 10 day alert (no signed in user).
 * get_setup_status lets the service role through from 0367.
 */
export async function getSetupCardAsService(companyId: string): Promise<SetupCard | null> {
  const admin = createServiceClient();
  const [{ data, error }, { data: co }] = await Promise.all([
    admin.rpc("get_setup_status", { p_company: companyId }),
    admin.from("companies").select("branch_word, branch_word_plural").eq("id", companyId).maybeSingle(),
  ]);
  if (error || !data) {
    if (error) console.error("getSetupCardAsService", companyId, error.message);
    return null;
  }
  const terms = branchTerms(branchWord(co as { branch_word?: string | null; branch_word_plural?: string | null } | null));
  return cardFromStatus(data as SetupStatus, terms);
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
