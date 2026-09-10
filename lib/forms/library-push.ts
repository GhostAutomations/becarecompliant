import "server-only";

/**
 * Be Care Compliant — offering a changed library form to the companies that hold it.
 *
 * Step 5 of Phil's forms plan. The founder edits a master template; this is how that
 * improvement reaches the companies who already have a copy, WITHOUT ever overwriting a
 * company that has made the form their own.
 *
 * Nothing here decides anything on its own. lib/forms/library-sync.ts holds the rule
 * (fingerprint the schemas with per company baked options removed, compare theirs against
 * what they were handed) and this module reads the database and asks it. The founder sees
 * the whole list — who is in step, who is behind, who has edited, who cannot be proved
 * either way — and chooses. Phil, 2026-09-10: "nothing reaches a customer without you
 * seeing the list."
 */

import { createClient } from "@/lib/supabase/server";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { fingerprintSchema, isPushable, pushStateFor, type PushState } from "./library-sync";

export type CompanyFormState = {
  formId: string;
  companyId: string;
  companyName: string;
  formName: string;
  currentVersion: number | null;
  libraryVersion: number | null;
  state: PushState;
  /** The library schema the push must still find recorded against this form, so a change
   *  made while the list was on screen fails that company rather than overwriting them. */
  expectLibrarySchema: unknown;
  /** True when this company has an unpublished draft of their own open. */
  hasOpenDraft: boolean;
  evidenceCount: number;
};

export type LibraryPushView = {
  templateKey: string;
  templateName: string;
  libraryVersion: number;
  libraryFingerprint: string;
  companies: CompanyFormState[];
};

/**
 * Every company holding this library form, and what a push would do to each.
 *
 * Read through the caller's own client: only a platform admin can see other companies'
 * forms, and that is enforced by RLS rather than by this function remembering to check.
 */
export async function libraryPushView(templateKey: string): Promise<LibraryPushView | null> {
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("form_templates")
    .select("key, name, version, schema")
    .eq("key", templateKey)
    .maybeSingle<{ key: string; name: string; version: number; schema: unknown }>();
  if (!template || !isFormSchema(template.schema)) return null;

  const libraryFingerprint = fingerprintSchema(template.schema as FormSchema);

  const { data: forms } = await supabase
    .from("forms")
    .select(
      "id, company_id, name, current_version, library_version, library_schema, companies(name)",
    )
    .eq("source_template_key", templateKey);

  const rows =
    ((forms ?? []) as unknown as Array<{
      id: string;
      company_id: string;
      name: string;
      current_version: number | null;
      library_version: number | null;
      library_schema: unknown;
      companies: { name: string } | null;
    }>) ?? [];

  if (rows.length === 0) {
    return {
      templateKey: template.key,
      templateName: template.name,
      libraryVersion: template.version,
      libraryFingerprint,
      companies: [],
    };
  }

  const formIds = rows.map((r) => r.id);
  const [{ data: versions }, { data: evidence }] = await Promise.all([
    supabase.from("form_versions").select("form_id, version, schema, status").in("form_id", formIds),
    supabase.from("evidence").select("form_id").in("form_id", formIds),
  ]);

  const versionRows =
    ((versions ?? []) as Array<{ form_id: string; version: number; schema: unknown; status: string }>) ?? [];

  const evidenceCounts = new Map<string, number>();
  for (const e of ((evidence ?? []) as Array<{ form_id: string }>) ?? []) {
    evidenceCounts.set(e.form_id, (evidenceCounts.get(e.form_id) ?? 0) + 1);
  }

  const companies: CompanyFormState[] = rows
    .map((row) => {
      const current = versionRows.find(
        (v) => v.form_id === row.id && v.version === row.current_version,
      );
      const hasOpenDraft = versionRows.some((v) => v.form_id === row.id && v.status === "draft");
      /* A copy we cannot read is never pushed to: "unknown" is the safe answer, and the
         screen says so rather than pretending it is fine. */
      const theirs = isFormSchema(current?.schema)
        ? fingerprintSchema(current!.schema as FormSchema)
        : null;
      const state: PushState =
        theirs === null
          ? "unknown"
          : pushStateFor({
              theirs,
              library: libraryFingerprint,
              /* Fingerprinted here rather than stored, so the rule for what counts as the
                 same form lives in exactly one module. */
              handed: isFormSchema(row.library_schema)
                ? fingerprintSchema(row.library_schema as FormSchema)
                : null,
            });
      return {
        formId: row.id,
        companyId: row.company_id,
        companyName: row.companies?.name ?? "Company",
        formName: row.name,
        currentVersion: row.current_version,
        libraryVersion: row.library_version,
        state,
        expectLibrarySchema: row.library_schema ?? null,
        hasOpenDraft,
        evidenceCount: evidenceCounts.get(row.id) ?? 0,
      };
    })
    .sort((a, b) => {
      /* Everything a push can act on first, so the founder reads the work before the
         exceptions. Then alphabetical, so the list does not reshuffle between visits. */
      const rank = (s: PushState) => (isPushable(s) ? 0 : s === "up_to_date" ? 2 : 1);
      return rank(a.state) - rank(b.state) || a.companyName.localeCompare(b.companyName);
    });

  return {
    templateKey: template.key,
    templateName: template.name,
    libraryVersion: template.version,
    libraryFingerprint,
    companies,
  };
}
