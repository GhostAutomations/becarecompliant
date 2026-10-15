"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { MODULE_LABELS, type ModuleKey } from "@/lib/modules/switch";
import type { ActionState } from "@/lib/forms";

/**
 * Founder: switch a module on or off for one company (0487, Rota and Visits beta, Phil
 * 2026-10-15). Off by default for every company. Switching off hides the module and keeps all of
 * its data; switching on again brings it all back. Enforced in the database too:
 * set_company_module refuses anyone who is not the Founder, and company_modules has no write
 * policy at all.
 */
export async function setCompanyModule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  const moduleKey = String(formData.get("module") ?? "") as ModuleKey;
  const on = formData.get("on") === "yes";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "That company could not be found." };
  if (!(moduleKey in MODULE_LABELS)) return { error: "That module is not recognised." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_company_module", {
    p_company: companyId,
    p_module: moduleKey,
    p_enabled: on,
  });
  if (error) return { error: error.message };
  if (data !== on) return { error: "The switch did not change. Please try again." };

  const label = MODULE_LABELS[moduleKey];
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: on ? "company.module_on" : "company.module_off",
    entityType: "company",
    entityId: companyId,
    summary: on
      ? `Switched on ${label}`
      : `Switched off ${label}: hidden from the company, all of its data kept`,
    metadata: { module: moduleKey, enabled: on },
  });

  revalidatePath(`/founder/companies/${companyId}`);
  // The nav and every module page read the switch, so the whole app is refreshed.
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}
