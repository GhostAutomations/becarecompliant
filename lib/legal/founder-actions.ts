"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

/**
 * Founder: switch the agreement on for one company before the final text is published, to test
 * the accept screen (0346). Once the supplier details are filled in the gate is on for everybody
 * and this switch no longer matters. Only the founder can change it: the column is guarded by
 * companies_guard_founder_columns, so a Company Admin cannot switch it off for themselves.
 */
export async function setAgreementRequired(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  const on = formData.get("on") === "yes";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "That company could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ agreement_required: on })
    .eq("id", companyId)
    .select("id, name");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That company could not be found." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: on ? "agreement.test_switched_on" : "agreement.test_switched_off",
    entityType: "company",
    entityId: companyId,
    summary: on
      ? "Asked this company's Company Admin to accept the draft agreement (test)"
      : "Stopped asking this company's Company Admin to accept the draft agreement",
  });
  revalidatePath("/founder/agreements");
  return { ok: "Saved" };
}
