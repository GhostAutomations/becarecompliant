"use server";

/**
 * Editing company letter wording. Company Admin only, matching every other Settings
 * surface. Each save writes the new wording AND appends it to the version history,
 * because a letter already sent went out under the wording live at the time and an
 * employment process can be challenged months later.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { letterDefinition } from "./letters";

function trimOrEmpty(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export async function saveLetterTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };

  const key = trimOrEmpty(formData.get("letter_key"));
  const def = letterDefinition(key);
  if (!def) return { error: "That is not a letter we send." };

  const subject = trimOrEmpty(formData.get("subject"));
  const body = trimOrEmpty(formData.get("body"));
  if (!body) return { error: "The letter needs some wording." };
  // The rearranged note is a paragraph inside another letter, so it has no subject
  // of its own; every other letter is an email and must have one.
  if (!subject && def.key !== "absence_meeting_rearranged") {
    return { error: "The letter needs a subject line." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("company_letter_templates")
    .select("id, version, subject, body")
    .eq("company_id", companyId)
    .eq("key", key)
    .maybeSingle();

  let templateId: string;
  let version: number;

  if (existing) {
    const row = existing as { id: string; version: number; subject: string; body: string };
    if (row.subject === subject && row.body === body) return { ok: "Saved" };
    version = row.version + 1;
    templateId = row.id;
    const { data, error } = await supabase
      .from("company_letter_templates")
      .update({ subject, body, version, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("company_id", companyId)
      .select("id");
    if (error || !data || data.length === 0) return { error: "Could not save this letter." };
  } else {
    version = 1;
    const { data, error } = await supabase
      .from("company_letter_templates")
      .insert({ company_id: companyId, key, subject, body, version, updated_by: profile.id })
      .select("id")
      .single();
    if (error || !data) return { error: "Could not save this letter." };
    templateId = (data as { id: string }).id;
  }

  // History is best effort: never block a save because the archive write failed.
  await supabase.from("company_letter_template_versions").insert({
    template_id: templateId,
    company_id: companyId,
    version,
    subject,
    body,
    created_by: profile.id,
  });

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "letters.template_saved",
    entityType: "company",
    entityId: companyId,
    summary: `Edited the ${def.name.toLowerCase()} letter (version ${version})`,
    metadata: { letter_key: key, version },
  });

  revalidatePath("/settings/letters");
  return { ok: "Saved" };
}

/** Put a letter back to the wording the app ships with. The row is removed rather
 *  than rewritten, so the letter reads from the packaged default again and future
 *  improvements to that default reach this company. History is kept. */
export async function resetLetterTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };

  const key = trimOrEmpty(formData.get("letter_key"));
  const def = letterDefinition(key);
  if (!def) return { error: "That is not a letter we send." };

  const supabase = await createClient();
  // Count the delete: an RLS refusal comes back as zero rows and NO error, so
  // checking only `error` would report success while nothing happened.
  const { error, count } = await supabase
    .from("company_letter_templates")
    .delete({ count: "exact" })
    .eq("company_id", companyId)
    .eq("key", key);
  if (error) return { error: "Could not put this letter back to the standard wording." };
  if (!count) return { ok: "Reset" }; // already on the standard wording

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "letters.template_reset",
    entityType: "company",
    entityId: companyId,
    summary: `Put the ${def.name.toLowerCase()} letter back to the standard wording`,
    metadata: { letter_key: key },
  });

  revalidatePath("/settings/letters");
  return { ok: "Reset" };
}
