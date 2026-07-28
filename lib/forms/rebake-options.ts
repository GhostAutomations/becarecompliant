import "server-only";

/**
 * Be Care Compliant — re-bake a company's baked-in Form dropdown options.
 *
 * Some Form fields offer the company's OWN lists rather than generic seeded values:
 * every field keyed branch or region offers the company's branches (migration 0076),
 * and the Return to Work form's "Interview conducted by" offers the company's staff
 * (migration 0145). Those options have to live in the STORED schema, not be injected
 * in the browser, because lib/form-validate.ts validates a single_select answer on the
 * server against the stored published schema: an option the server has never seen is
 * rejected on save.
 *
 * Stored options go stale the moment the underlying list changes, so this is called
 * wherever it changes: someone accepting an invite (and setting their name), a user
 * being enabled, disabled or deleted, a branch being created or renamed, and a fresh
 * set of master templates being imported into a company.
 *
 * BEST EFFORT, exactly like writeAudit: a Form whose dropdown is one name out of date
 * is a far smaller problem than an administrator being unable to disable a user, so a
 * failure is logged to the server console and never thrown. Call it AFTER the write it
 * follows has succeeded.
 *
 * All the jsonb surgery lives in public.rebake_form_field_options (migration 0144) so
 * the initial bake and every re-bake share one definition. The function is SECURITY
 * DEFINER and takes the company id as a parameter, so EXECUTE is granted to
 * service_role only and this is the one way in.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export async function rebakeFormFieldOptions(
  companyId: string | null | undefined,
): Promise<void> {
  if (!companyId) return;
  try {
    const admin = createServiceClient();
    const { error } = await admin.rpc("rebake_form_field_options", {
      p_company_id: companyId,
    });
    if (error) {
      console.error("[rebakeFormFieldOptions] failed:", error.message);
    }
  } catch (e) {
    console.error("[rebakeFormFieldOptions] failed:", (e as Error).message);
  }
}
