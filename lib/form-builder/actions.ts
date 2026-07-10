"use server";

/**
 * Be Care Compliant — Form builder (Phase 5) server actions.
 *
 * Thin, authorised wrappers over the SECURITY DEFINER version-lifecycle RPCs from
 * migration 0038. The RPCs enforce the invariant that matters (a published version
 * is never mutated in place; editing spins up a new draft; publishing promotes it).
 * These actions add the app-guard, audit trail, cache revalidation and the client
 * redirect contract (ActionState.redirectTo + router.replace on the client; we
 * never call next/navigation redirect() to a query-string URL).
 *
 * "use server" files export only async functions; all shared types/consts live in
 * lib/form-builder/types.ts and schema-ops.ts.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin, requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { isFormSchema, type FieldType, type FormSchema } from "@/lib/form-schema";
import { validateSchema, hasBlockingErrors } from "@/lib/form-builder/schema-ops";
import type { ActionState } from "@/lib/forms";
import type { Population } from "./types";

function companyOf(profile: { company_id: string | null }): string | null {
  return profile.company_id;
}

/** Create a new company form (blank or duplicated). Opens the builder on success. */
export async function createCompanyForm(input: {
  name: string;
  population: Population;
  sourceFormId?: string | null;
}): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = companyOf(profile);
  if (!companyId) return { error: "No company context." };

  const name = input.name.trim();
  if (!name) return { error: "Enter a form name." };
  if (input.population !== "people" && input.population !== "service_users") {
    return { error: "Choose who the form is for." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_company_form", {
    p_company_id: companyId,
    p_name: name,
    p_population: input.population,
    p_source_form_id: input.sourceFormId ?? null,
  });
  if (error) return { error: error.message };

  const formId = data as string;
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form.created",
    entityType: "form",
    entityId: formId,
    summary: `Created form "${name}"`,
    metadata: { population: input.population, duplicated_from: input.sourceFormId ?? null },
  });

  revalidatePath("/settings/forms");
  return { ok: "Form created.", redirectTo: `/settings/forms/${formId}` };
}

/** Open (or reuse) the draft version for a form, so the author can edit it. */
export async function ensureDraft(formId: string): Promise<ActionState & { versionId?: string }> {
  const { profile } = await requireCompanyAdmin();
  if (!companyOf(profile)) return { error: "No company context." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_form_draft", { p_form_id: formId });
  if (error) return { error: error.message };
  revalidatePath(`/settings/forms/${formId}`);
  return { ok: "Draft ready.", versionId: data as string };
}

/** Save the working schema into a DRAFT version (rejected server-side if published). */
export async function saveDraft(versionId: string, schema: FormSchema): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!companyOf(profile)) return { error: "No company context." };
  if (!isFormSchema(schema)) return { error: "The form structure is not valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_form_draft", {
    p_version_id: versionId,
    p_schema: schema,
  });
  if (error) return { error: error.message };
  return { ok: "Saved." };
}

/** Publish a draft: it becomes the current version. Existing evidence is untouched. */
export async function publishForm(versionId: string, formId: string): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = companyOf(profile);
  if (!companyId) return { error: "No company context." };

  // Re-read the draft schema and block publish on structural errors.
  const supabase = await createClient();
  const { data: ver } = await supabase
    .from("form_versions")
    .select("schema, status")
    .eq("id", versionId)
    .maybeSingle();
  if (!ver) return { error: "Version not found." };
  if (!isFormSchema(ver.schema)) return { error: "The form structure is not valid." };
  if (hasBlockingErrors(validateSchema(ver.schema))) {
    return { error: "Fix the highlighted problems before publishing." };
  }

  const { data, error } = await supabase.rpc("publish_form_version", { p_version_id: versionId });
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form.published",
    entityType: "form",
    entityId: formId,
    summary: `Published version ${data as number}`,
    metadata: { version: data },
  });

  revalidatePath("/settings/forms");
  revalidatePath(`/settings/forms/${formId}`);
  return { ok: `Published version ${data as number}.` };
}

/** Discard an open draft. Returns to the forms list. */
export async function discardDraft(versionId: string, formId: string): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = companyOf(profile);
  if (!companyId) return { error: "No company context." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_form_draft", { p_version_id: versionId });
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form.draft_discarded",
    entityType: "form",
    entityId: formId,
    summary: "Discarded a draft",
  });

  revalidatePath("/settings/forms");
  revalidatePath(`/settings/forms/${formId}`);
  return { ok: "Draft discarded.", redirectTo: "/settings/forms" };
}

// ---------------------------------------------------------------------------
// Founder master template curation (platform admin only)
// ---------------------------------------------------------------------------

export async function createTemplate(input: {
  key: string;
  name: string;
  population: Population;
}): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const key = input.key.trim();
  const name = input.name.trim();
  if (!key) return { error: "Enter a template key." };
  if (input.population !== "people" && input.population !== "service_users") {
    return { error: "Choose who the template is for." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_form_template", {
    p_key: key,
    p_name: name,
    p_population: input.population,
    p_schema: null,
  });
  if (error) return { error: error.message };

  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form_template.created",
    entityType: "form_template",
    entityId: data as string,
    summary: `Created master template "${name || key}"`,
    metadata: { key, population: input.population },
  });

  revalidatePath("/founder/forms");
  return { ok: "Template created.", redirectTo: `/founder/forms/${data as string}` };
}

export async function saveTemplate(
  templateId: string,
  name: string,
  schema: FormSchema,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  if (!isFormSchema(schema)) return { error: "The template structure is not valid." };
  if (hasBlockingErrors(validateSchema(schema))) {
    return { error: "Fix the highlighted problems before saving." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_form_template", {
    p_template_id: templateId,
    p_name: name,
    p_schema: schema,
  });
  if (error) return { error: error.message };

  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form_template.updated",
    entityType: "form_template",
    entityId: templateId,
    summary: "Updated a master template",
  });

  revalidatePath("/founder/forms");
  revalidatePath(`/founder/forms/${templateId}`);
  return { ok: "Template saved." };
}

export async function setTemplateStatus(
  templateId: string,
  status: "active" | "archived",
): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_form_template_status", {
    p_template_id: templateId,
    p_status: status,
  });
  if (error) return { error: error.message };
  revalidatePath("/founder/forms");
  return { ok: status === "archived" ? "Template archived." : "Template restored." };
}

// ---------------------------------------------------------------------------
// Question bank curation (platform admin only; RLS also enforces it)
// ---------------------------------------------------------------------------

const BANK_FIELD_TYPES: FieldType[] = [
  "short_text",
  "long_text",
  "number",
  "date",
  "time",
  "email",
  "phone",
  "address",
  "yes_no",
  "single_select",
  "multi_select",
  "radio",
  "rating",
  "checkbox",
];

export type BankInput = {
  label: string;
  fieldType: FieldType;
  population: "any" | Population;
  category?: string | null;
  helpText?: string | null;
  options?: { value: string; label: string }[] | null;
};

function validateBankInput(input: BankInput): string | null {
  if (input.label.trim() === "") return "Enter a question label.";
  if (!BANK_FIELD_TYPES.includes(input.fieldType)) return "Choose a valid field type.";
  if (!["any", "people", "service_users"].includes(input.population)) {
    return "Choose who the question is for.";
  }
  return null;
}

export async function createQuestionTemplate(input: BankInput): Promise<ActionState> {
  await requirePlatformAdmin();
  const err = validateBankInput(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase.from("question_templates").insert({
    label: input.label.trim(),
    field_type: input.fieldType,
    population: input.population,
    category: input.category?.trim() || null,
    help_text: input.helpText?.trim() || null,
    options: input.options && input.options.length > 0 ? input.options : null,
  });
  if (error) return { error: error.message };
  revalidatePath("/founder/question-bank");
  return { ok: "Question added." };
}

export async function updateQuestionTemplate(id: string, input: BankInput): Promise<ActionState> {
  await requirePlatformAdmin();
  const err = validateBankInput(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("question_templates")
    .update({
      label: input.label.trim(),
      field_type: input.fieldType,
      population: input.population,
      category: input.category?.trim() || null,
      help_text: input.helpText?.trim() || null,
      options: input.options && input.options.length > 0 ? input.options : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/founder/question-bank");
  return { ok: "Question saved." };
}

export async function setQuestionTemplateActive(id: string, active: boolean): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("question_templates").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/founder/question-bank");
  return { ok: active ? "Question restored." : "Question archived." };
}
