/**
 * Be Care Compliant — import founder-curated master templates into an EXISTING
 * company. seed_company_form_templates and seed_company_training_courses run only
 * at company creation; this lets a founder (or the company's own Admin) pull newly
 * added or updated master templates into a company that already exists.
 *
 * Both RPCs are idempotent (skip keys/names already present) and SECURITY DEFINER,
 * guarded internally to platform_admin OR the company's own admin, so calling them
 * with the caller's authed client is safe for both paths. This module holds no
 * "use server" directive: it is a plain async helper imported by the two server
 * actions (founder and Admin), each of which applies its own guard first.
 */

import { createClient } from "@/lib/supabase/server";

export type TemplateImportResult = {
  formsAdded: number;
  trainingAdded: number;
  formsError: string | null;
  trainingError: string | null;
};

/** Copy all active master form templates + training courses that the company is
 *  missing. Errors on one category do not abort the other; both are reported. */
export async function importCompanyTemplates(
  companyId: string,
): Promise<TemplateImportResult> {
  const supabase = await createClient();

  const { data: formsAdded, error: formsErr } = await supabase.rpc(
    "seed_company_form_templates",
    { cid: companyId },
  );
  const { data: trainingAdded, error: trainingErr } = await supabase.rpc(
    "seed_company_training_courses",
    { cid: companyId },
  );

  return {
    formsAdded: formsErr ? 0 : Number(formsAdded ?? 0),
    trainingAdded: trainingErr ? 0 : Number(trainingAdded ?? 0),
    formsError: formsErr?.message ?? null,
    trainingError: trainingErr?.message ?? null,
  };
}

/** A plain English summary for the action result banner (no dashes in copy). */
export function importSummary(r: TemplateImportResult): string {
  const parts: string[] = [];
  parts.push(
    r.formsError
      ? `Forms could not be imported: ${r.formsError}`
      : `${r.formsAdded} new ${r.formsAdded === 1 ? "form" : "forms"} added`,
  );
  parts.push(
    r.trainingError
      ? `training courses could not be imported: ${r.trainingError}`
      : `${r.trainingAdded} new training ${r.trainingAdded === 1 ? "course" : "courses"} added`,
  );
  return `${parts.join(", ")}. Anything already present was left unchanged.`;
}
