"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { branchWordFromForm, getDeal, parseDealFromForm, writeDeal } from "@/lib/billing/deal-store";
import type { DealRow } from "@/lib/billing/deal";
import { listAcceptances } from "@/lib/legal/acceptance";
import { acceptanceCurrent } from "@/lib/legal/fill";
import { LEGAL_VERSIONS, legalPublished } from "@/lib/legal/documents";

/**
 * Founder: set or change a company's deal and its word for "branch" (0354, Phil 2026-09-30).
 *
 * The deal can be changed until their Admin accepts the agreement. After that the Order they
 * accepted is the contract, so the deal is locked here rather than quietly charging something
 * different from what they signed. The branch word is only wording, so it can change any time.
 */
export async function saveCompanyDeal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "That company could not be found." };

  const word = branchWordFromForm(formData);
  if ("error" in word) return { error: word.error };
  const deal = parseDealFromForm(formData);
  if (!deal.ok) return { error: deal.error };

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id, tier").eq("id", companyId).maybeSingle();
  if (!company) return { error: "That company could not be found." };
  if (deal.row && company.tier === "black") {
    return { error: "A Black account is free, so it has no deal. Choose 'Let them choose' or move them to Business or Pro first." };
  }

  const { error: wordErr } = await supabase
    .from("companies")
    .update({ branch_word: word.one, branch_word_plural: word.many })
    .eq("id", companyId);
  if (wordErr) return { error: wordErr.message };

  const accepted = acceptanceCurrent(await listAcceptances(companyId), LEGAL_VERSIONS, legalPublished());
  const existing = await getDeal(supabase, companyId);
  const same = (a: DealRow | null, b: DealRow | null) => {
    if (!a || !b) return a === b;
    const keys: (keyof DealRow)[] = [
      "billing_option", "extras_billing", "extra_users", "extra_branches", "plan_price_pence", "seat_price_pence",
      "branch_price_pence", "branch_step_after", "branch_step_price_pence", "onboarding_fee_pence",
    ];
    return keys.every((k) => (a[k] ?? null) === (b[k] ?? null));
  };
  const dealChanging = !same(deal.row, existing);
  if (!dealChanging && (existing?.notes ?? null) === deal.notes) {
    revalidatePath(`/founder/companies/${companyId}`);
    return { ok: "Saved" };
  }
  if (accepted && dealChanging) {
    revalidatePath(`/founder/companies/${companyId}`);
    return {
      error:
        "Branch word saved. The deal was not changed: their Admin has already accepted the agreement with it, and the Order they accepted is the contract.",
    };
  }

  const saved = await writeDeal(supabase, companyId, deal.row, deal.notes, user.id);
  if (saved.error) return { error: saved.error };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: deal.row ? "deal.saved" : "deal.cleared",
    entityType: "company",
    entityId: companyId,
    summary: deal.row ? "Set the deal for this company's Order" : "Removed the deal: they choose on the Order",
    metadata: { deal: deal.row, branch_word: word.one, branch_word_plural: word.many },
  });
  revalidatePath(`/founder/companies/${companyId}`);
  return { ok: "Saved" };
}
