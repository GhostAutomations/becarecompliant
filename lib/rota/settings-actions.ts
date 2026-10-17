"use server";

/**
 * Be Care Compliant: save the Settings, Rota options (Stage 7b part 2a). Company Admins only, here
 * and in RLS (rota_settings_write, 0509), and only while the company has Rota and Visits on.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { writeAudit } from "@/lib/audit";
import { parseRotaSettings, rotaSettingsRow } from "@/lib/rota/settings-rules";
import type { ActionState } from "@/lib/forms";

export async function saveRotaSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "Select a company first." };
  if (!moduleOnInRow(await getCompanyRow(companyId), "rota_visits")) return { error: "Rota and Visits is not switched on for your company." };

  const parsed = parseRotaSettings((name) => formData.get(name));
  if ("error" in parsed) return { error: parsed.error };
  const row = rotaSettingsRow(parsed.values);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rota_settings")
    .upsert({ company_id: companyId, ...row, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "company_id" })
    .select("company_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "The settings could not be saved. Ask a Company Admin." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "rota.settings_saved",
    entityType: "company",
    entityId: companyId,
    summary: "Saved the Rota settings",
    metadata: row,
  });
  revalidatePath("/settings/rota");
  return { ok: "Saved." };
}
