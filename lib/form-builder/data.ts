import "server-only";

/**
 * Be Care Compliant — Form builder (Phase 5) server data access.
 *
 * All reads go through the RLS-scoped user client. Company forms are readable by
 * any company member but only authored by a Company Admin (RLS on forms /
 * form_versions); the master form_templates library is Platform Admin (Founder)
 * only. These loaders never bypass RLS.
 */

import { createClient } from "@/lib/supabase/server";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import type { FormSummary, FormVersionRow, Population, TemplateSummary } from "./types";

/** Every company form with its published version and whether a draft is parked. */
export async function listCompanyForms(companyId: string): Promise<FormSummary[]> {
  const supabase = await createClient();
  const { data: forms } = await supabase
    .from("forms")
    .select("id, key, name, population, status, source_template_key, current_version")
    .eq("company_id", companyId)
    .order("population", { ascending: true })
    .order("name", { ascending: true });

  const rows = (forms ?? []) as Array<{
    id: string;
    key: string;
    name: string;
    population: Population;
    status: "active" | "archived";
    source_template_key: string | null;
    current_version: number | null;
  }>;
  if (rows.length === 0) return [];

  // One query for all draft versions across these forms.
  const { data: drafts } = await supabase
    .from("form_versions")
    .select("form_id")
    .eq("status", "draft")
    .in("form_id", rows.map((r) => r.id));
  const withDraft = new Set((drafts ?? []).map((d) => (d as { form_id: string }).form_id));

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    population: r.population,
    currentVersion: r.current_version,
    hasDraft: withDraft.has(r.id),
    sourceTemplateKey: r.source_template_key,
    status: r.status,
  }));
}

export type FormForEdit = {
  id: string;
  name: string;
  key: string;
  population: Population;
  currentVersion: number | null;
  /** The open draft (id + schema) if one exists. */
  draft: { versionId: string; schema: FormSchema } | null;
  /** The current published version (id + version + schema) if one exists. */
  published: { versionId: string; version: number; schema: FormSchema } | null;
  versions: FormVersionRow[];
};

/** Load a single company form for the builder, with its draft, published and history. */
export async function getFormForEdit(
  companyId: string,
  formId: string,
): Promise<FormForEdit | null> {
  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, name, key, population, current_version, company_id")
    .eq("id", formId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!form) return null;

  const { data: versions } = await supabase
    .from("form_versions")
    .select("id, version, schema, status, created_at, created_by")
    .eq("form_id", formId)
    .order("version", { ascending: false });
  const vs = (versions ?? []) as Array<{
    id: string;
    version: number;
    schema: unknown;
    status: "draft" | "published" | "archived";
    created_at: string;
    created_by: string | null;
  }>;

  // Resolve author names in one query.
  const authorIds = Array.from(new Set(vs.map((v) => v.created_by).filter(Boolean))) as string[];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);
    for (const p of (people ?? []) as Array<{ id: string; full_name: string }>) {
      nameById.set(p.id, p.full_name);
    }
  }

  const currentVersion = (form.current_version as number | null) ?? null;
  const draftRow = vs.find((v) => v.status === "draft") ?? null;
  const publishedRow = currentVersion != null ? vs.find((v) => v.version === currentVersion) : null;

  return {
    id: form.id as string,
    name: form.name as string,
    key: form.key as string,
    population: form.population as Population,
    currentVersion,
    draft:
      draftRow && isFormSchema(draftRow.schema)
        ? { versionId: draftRow.id, schema: draftRow.schema }
        : null,
    published:
      publishedRow && isFormSchema(publishedRow.schema)
        ? { versionId: publishedRow.id, version: publishedRow.version, schema: publishedRow.schema }
        : null,
    versions: vs.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      createdAt: v.created_at,
      createdByName: v.created_by ? nameById.get(v.created_by) ?? null : null,
      isCurrent: currentVersion != null && v.version === currentVersion,
    })),
  };
}

// ---------------------------------------------------------------------------
// Founder master template library
// ---------------------------------------------------------------------------

/** All master templates (Founder only; RLS blocks non platform admins). */
export async function listFormTemplates(): Promise<TemplateSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_templates")
    .select("id, key, name, population, version, status")
    .order("population", { ascending: true })
    .order("name", { ascending: true });
  return ((data ?? []) as TemplateSummary[]).map((t) => ({ ...t }));
}

export type TemplateForEdit = {
  id: string;
  key: string;
  name: string;
  population: Population;
  version: number;
  status: "active" | "archived";
  schema: FormSchema | null;
};

export async function getTemplateForEdit(templateId: string): Promise<TemplateForEdit | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_templates")
    .select("id, key, name, population, version, status, schema")
    .eq("id", templateId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    key: data.key as string,
    name: data.name as string,
    population: data.population as Population,
    version: data.version as number,
    status: data.status as "active" | "archived",
    schema: isFormSchema(data.schema) ? data.schema : null,
  };
}
