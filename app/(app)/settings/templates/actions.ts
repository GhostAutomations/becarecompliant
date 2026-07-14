"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { importCompanyTemplates, importSummary } from "@/lib/templates/import";
import type { ActionState } from "@/lib/forms";

/** Company Admin: import the latest founder-curated master templates (forms +
 *  training courses) into their own company. Idempotent; the SECURITY DEFINER
 *  seed RPCs authorise the company's own admin. */
export async function importOwnCompanyTemplates(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company found for your account." };

  const result = await importCompanyTemplates(profile.company_id);

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.templates_imported",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Imported master templates: ${result.formsAdded} forms, ${result.trainingAdded} training courses`,
    metadata: {
      forms_added: result.formsAdded,
      training_added: result.trainingAdded,
      forms_error: result.formsError,
      training_error: result.trainingError,
    },
  });

  revalidatePath("/settings/templates");
  revalidatePath("/settings/forms");
  if (result.formsError && result.trainingError) {
    return { error: importSummary(result) };
  }
  return { ok: importSummary(result) };
}
