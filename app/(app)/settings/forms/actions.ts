"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

/**
 * Link a form to a compliance check (a register column) in its department, edited
 * from the Forms list. A form links to at most one column: setting a column points
 * that check at this form and clears this form from any other check. Past evidence
 * keeps the form it was completed on. Admin only (RLS also enforces it).
 */
export async function setFormColumnLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const formId = String(formData.get("form_id") ?? "").trim();
  const checkId = String(formData.get("check_id") ?? "").trim();
  if (!formId) return { error: "Missing form." };

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, population, name")
    .eq("id", formId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!form) return { error: "That form could not be found." };

  // A form links to at most one column: clear it from every check first.
  const { error: clearErr } = await supabase
    .from("check_definitions")
    .update({ form_id: null })
    .eq("company_id", companyId)
    .eq("form_id", formId);
  if (clearErr) return { error: clearErr.message };

  let summary = `Unlinked form "${form.name}" from all columns`;
  if (checkId) {
    const { data: check } = await supabase
      .from("check_definitions")
      .select("id, name, population")
      .eq("id", checkId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!check) return { error: "That column could not be found." };
    if ((check.population as string) !== (form.population as string)) {
      return { error: "That column is not in this form's department." };
    }
    const { data, error } = await supabase
      .from("check_definitions")
      .update({ form_id: formId })
      .eq("id", checkId)
      .eq("company_id", companyId)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "No change was saved." };
    summary = `Linked form "${form.name}" to the "${check.name}" column`;
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form.column_linked",
    entityType: "form",
    entityId: formId,
    summary,
    metadata: { check_id: checkId || null },
  });

  revalidatePath("/settings/forms");
  return { ok: "Saved." };
}
