"use server";

/**
 * Be Care Compliant — the company edits its own customer satisfaction questions.
 *
 * Phil, 2026-09-12: a Customer Satisfaction section in Settings, Service users, where a
 * company adds and removes the questions that feed the PQS score — "they should only be
 * editable in there settings to protect the scoring mechanism".
 *
 * THE POINT OF PUTTING THEM HERE is that a scored question is not an ordinary form field.
 * In the form builder it looks like any other yes/no, and somebody tidying a form would
 * reword it, drag it into another section or delete it without ever knowing they had moved
 * the number the regulator reads. So the form builder refuses to touch them
 * (lib/form-builder/actions.ts) and this is the only door.
 *
 * Editing writes the company's CURRENT form version in place. Evidence already recorded
 * keeps its own frozen copy of the questions and is scored on those, so changing the list
 * never rewrites a figure already reported.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { isFormSchema, type FormField, type FormSchema } from "@/lib/form-schema";
import {
  SATISFACTION_SECTION_TITLE,
  STANDARD_SATISFACTION_QUESTIONS,
  detailKeyFor,
  isSatisfactionField,
  satisfactionQuestions,
} from "./satisfaction-questions";
import type { ActionState } from "@/lib/forms";

/** A key a company's own question is given. Stable, readable, and namespaced so it can
 *  never collide with a field the library ships later. */
function keyFromLabel(label: string, taken: Set<string>): string {
  const base =
    "sat_" +
    (label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "question");
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  return key;
}

function yesNoField(key: string, label: string): FormField {
  return {
    key,
    type: "single_select",
    label,
    required: true,
    satisfaction: true,
    options: [
      { label: "No", value: "No" },
      { label: "Yes", value: "Yes" },
    ],
  };
}

/**
 * Every scored question gets a reason box on No (Phil, 2026-09-12): a score with nothing
 * behind it tells a manager something is wrong but not what.
 *
 * REQUIRED (Phil, 2026-09-14: "all questions in the satsfaction section must be manitory").
 * It costs nothing on a good review, because the validator skips a field nobody was shown,
 * and it means a bad one always carries its reason.
 */
function detailField(key: string): FormField {
  return {
    key: detailKeyFor(key),
    type: "long_text",
    label: "What is wrong?",
    required: true,
    help: "Say what the individual told you, in their words where you can.",
    visibleWhen: { field: key, in: ["No"] },
  };
}

async function loadForm(companyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, current_version")
    .eq("company_id", companyId)
    .eq("key", "care_plan_review")
    .maybeSingle<{ id: string; current_version: number | null }>();
  if (!data) return null;
  const { data: ver } = await supabase
    .from("form_versions")
    .select("id, schema")
    .eq("form_id", data.id)
    .eq("version", data.current_version ?? 1)
    .maybeSingle<{ id: string; schema: unknown }>();
  if (!ver || !isFormSchema(ver.schema)) return null;
  return { formId: data.id, versionId: ver.id, schema: ver.schema as FormSchema };
}

/** Write the schema back and keep the library fingerprint honest. */
async function saveSchema(
  companyId: string,
  formId: string,
  versionId: string,
  schema: FormSchema,
  audit: { action: string; summary: string; metadata?: Record<string, unknown> },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("form_versions")
    .update({ schema })
    .eq("id", versionId);
  if (error) return { error: error.message };

  const { profile, user } = await requireCompanyAdmin();
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: audit.action,
    entityType: "form",
    entityId: formId,
    summary: audit.summary,
    metadata: audit.metadata,
  });
  revalidatePath("/settings/service-users");
  revalidatePath("/service-users/satisfaction");
  return null;
}

/** Put a question, and its reason box, into the Customer Satisfaction section. */
function withQuestionAdded(schema: FormSchema, field: FormField): FormSchema {
  const sections = schema.sections.map((s) => ({ ...s, fields: [...s.fields] }));
  let target = sections.find((s) => s.title === SATISFACTION_SECTION_TITLE);
  if (!target) {
    target = { id: "customer_satisfaction", title: SATISFACTION_SECTION_TITLE, fields: [] };
    /* Before Sign Off if there is one, so the form still ends where people expect. */
    const signOff = sections.findIndex((s) => s.title === "Sign Off");
    if (signOff >= 0) sections.splice(signOff, 0, target);
    else sections.push(target);
  }
  target.fields.push(field, detailField(field.key));
  return { ...schema, sections };
}

export async function addSatisfactionQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Write the question first." };
  if (label.length > 200) return { error: "That question is too long to read on a form." };

  const form = await loadForm(profile.company_id);
  if (!form) return { error: "This company has no Individual Plan Review to add it to." };

  const taken = new Set(form.schema.sections.flatMap((s) => s.fields.map((f) => f.key)));
  const key = keyFromLabel(label, taken);
  const next = withQuestionAdded(form.schema, yesNoField(key, label));

  const err = await saveSchema(profile.company_id, form.formId, form.versionId, next, {
    action: "satisfaction.question_added",
    summary: `Customer satisfaction question added: ${label}`,
    metadata: { key },
  });
  return err ?? { ok: "Question added." };
}

export async function removeSatisfactionQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "Missing question." };

  const form = await loadForm(profile.company_id);
  if (!form) return { error: "This company has no Individual Plan Review to change." };

  const question = satisfactionQuestions(form.schema).find((q) => q.key === key);
  if (!question) return { error: "That question is not being scored." };

  /* The question and the reason box that belongs to it go together: a follow-up left behind
     would keep opening for an answer nobody is asked for any more. Anything ELSE that
     happens to depend on the question is left alone and reported, rather than deleted on a
     guess. */
  const dependents = form.schema.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.visibleWhen?.field === key && f.key !== detailKeyFor(key))
    .map((f) => f.label);

  const sections = form.schema.sections
    .map((s) => ({
      ...s,
      fields: s.fields.filter((f) => f.key !== key && f.key !== detailKeyFor(key)),
    }))
    .filter((s) => s.fields.length > 0);

  const err = await saveSchema(
    profile.company_id,
    form.formId,
    form.versionId,
    { ...form.schema, sections },
    {
      action: "satisfaction.question_removed",
      summary: `Customer satisfaction question removed: ${question.label}`,
      metadata: { key, dependents },
    },
  );
  if (err) return err;
  return {
    ok:
      dependents.length > 0
        ? `Question removed. ${dependents.join(", ")} depended on it and is still on the form; check it still makes sense.`
        : "Question removed. Reviews already completed keep their original score.",
  };
}

export async function renameSatisfactionQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!key) return { error: "Missing question." };
  if (!label) return { error: "A question needs some words." };
  if (label.length > 200) return { error: "That question is too long to read on a form." };

  const form = await loadForm(profile.company_id);
  if (!form) return { error: "This company has no Individual Plan Review to change." };

  let found = false;
  const sections = form.schema.sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) => {
      if (f.key !== key || !isSatisfactionField(f)) return f;
      found = true;
      return { ...f, label };
    }),
  }));
  if (!found) return { error: "That question is not being scored." };

  const err = await saveSchema(
    profile.company_id,
    form.formId,
    form.versionId,
    { ...form.schema, sections },
    {
      action: "satisfaction.question_reworded",
      summary: `Customer satisfaction question reworded: ${label}`,
      metadata: { key },
    },
  );
  return err ?? { ok: "Saved." };
}

/**
 * Put back a standard question that was removed.
 *
 * Phil, 2026-09-14, on what was still open: a removed standard question could not be
 * restored. Retyping it looks like the same question and is not — it gets a new key, so the
 * history splits in two and the old answers stop belonging to anything. Restoring by KEY is
 * the only way back that keeps a question's past attached to it.
 *
 * Idempotent: a question already present is left exactly as the company has it, wording and
 * all, so this can never quietly undo a rewording.
 */
export async function restoreStandardSatisfactionQuestions(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };

  const form = await loadForm(profile.company_id);
  if (!form) return { error: "This company has no Individual Plan Review to change." };

  const present = new Set(
    form.schema.sections.flatMap((s) => s.fields.map((f) => f.key)),
  );
  const missing = STANDARD_SATISFACTION_QUESTIONS.filter((q) => !present.has(q.key));
  if (missing.length === 0) return { ok: "Every standard question is already on the form." };

  let next = form.schema;
  for (const q of missing) next = withQuestionAdded(next, yesNoField(q.key, q.label));

  const err = await saveSchema(profile.company_id, form.formId, form.versionId, next, {
    action: "satisfaction.standard_restored",
    summary: `Standard customer satisfaction question(s) restored: ${missing.map((q) => q.label).join("; ")}`,
    metadata: { keys: missing.map((q) => q.key) },
  });
  return err ?? {
    ok: `Restored ${missing.length} standard question${missing.length === 1 ? "" : "s"}. Answers recorded against ${missing.length === 1 ? "it" : "them"} before are still attached.`,
  };
}
