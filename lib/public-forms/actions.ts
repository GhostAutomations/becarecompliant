"use server";

/**
 * Be Care Compliant — public form admin + queue actions (signed in).
 *
 *   createPublicLink / setPublicLinkEnabled / regeneratePublicLinkCode :
 *     a Company Admin publishes, withdraws or reissues the short link for a form.
 *   linkSubmission / discardSubmission :
 *     a Manager or Admin clears an unmatched submission from the queue.
 *
 * The public submit path is NOT here: it lives in lib/public-forms/submit.ts and
 * runs through the service role, because it has no session to authorise.
 */

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { requireCompany, requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, publicFormDef } from "@/lib/public-forms/config";
import { notifyHolidayRequested } from "@/lib/notifications/holiday";

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** A six character code from the unambiguous alphabet, e.g. "k3m9qa". */
function newLinkCode(): string {
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    out += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return out;
}

/** Publish the short link for a form. Re-publishing an existing one keeps its code. */
export async function createPublicLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const formKey = String(formData.get("form_key") ?? "");
  const def = publicFormDef(formKey);
  if (!def) return { error: "That form cannot be published." };

  const supabase = await createClient();

  // Already published once and switched off: switch it back on, same code, so
  // any link already printed keeps working.
  const { data: existing } = await supabase
    .from("public_form_links")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("form_key", formKey)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("public_form_links")
      .update({ enabled: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: `The link could not be switched on: ${error.message}` };
  } else {
    // Retry on the (astronomically unlikely) code collision rather than failing.
    let lastError = "";
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const { error } = await supabase.from("public_form_links").insert({
        company_id: profile.company_id,
        form_key: formKey,
        code: newLinkCode(),
        enabled: true,
        created_by: user.id,
      });
      if (!error) {
        created = true;
      } else if (error.code !== "23505") {
        return { error: `The link could not be created: ${error.message}` };
      } else {
        lastError = error.message;
      }
    }
    if (!created) return { error: `The link could not be created: ${lastError}` };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "public_form.published",
    entityType: "public_form_link",
    entityId: (existing?.id as string | undefined) ?? null,
    summary: `Published the ${def.label} form as a public link`,
    metadata: { form_key: formKey },
  });

  revalidatePath("/settings/public-forms");
  return { ok: "Link created." };
}

/** Switch a published link on or off without losing its code or its history. */
export async function setPublicLinkEnabled(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const formKey = String(formData.get("form_key") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const def = publicFormDef(formKey);
  if (!def) return { error: "That form cannot be published." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_form_links")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("company_id", profile.company_id)
    .eq("form_key", formKey)
    .select("id");
  if (error) return { error: `The link could not be changed: ${error.message}` };
  if (!data || data.length === 0) {
    return { error: "That link no longer exists. Create it again." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: enabled ? "public_form.enabled" : "public_form.disabled",
    entityType: "public_form_link",
    entityId: data[0].id as string,
    summary: `${enabled ? "Switched on" : "Switched off"} the public ${def.label} form`,
    metadata: { form_key: formKey },
  });

  revalidatePath("/settings/public-forms");
  return { ok: enabled ? "Link switched on." : "Link switched off." };
}

/** Issue a new code. Every copy of the old link stops working immediately. */
export async function regeneratePublicLinkCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const formKey = String(formData.get("form_key") ?? "");
  const def = publicFormDef(formKey);
  if (!def) return { error: "That form cannot be published." };

  const supabase = await createClient();

  let updatedId: string | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 5 && !updatedId; attempt += 1) {
    const { data, error } = await supabase
      .from("public_form_links")
      .update({ code: newLinkCode(), updated_at: new Date().toISOString() })
      .eq("company_id", profile.company_id)
      .eq("form_key", formKey)
      .select("id");
    if (!error) {
      if (!data || data.length === 0) {
        return { error: "That link no longer exists. Create it again." };
      }
      updatedId = data[0].id as string;
    } else if (error.code !== "23505") {
      return { error: `The link could not be changed: ${error.message}` };
    } else {
      lastError = error.message;
    }
  }
  if (!updatedId) return { error: `The link could not be changed: ${lastError}` };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "public_form.code_regenerated",
    entityType: "public_form_link",
    entityId: updatedId,
    summary: `Issued a new public link for the ${def.label} form`,
    metadata: { form_key: formKey },
  });

  revalidatePath("/settings/public-forms");
  return { ok: "New link issued." };
}

/** Link an unmatched submission to the right Person. */
export async function linkSubmission(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const submissionId = String(formData.get("submission_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!submissionId) return { error: "Missing submission." };
  if (!personId) return { error: "Choose the person this belongs to." };

  const supabase = await createClient();

  // Read the dates before the link, so the approver email can quote them.
  const { data: submission } = await supabase
    .from("public_form_submissions")
    .select("form_key, answers")
    .eq("id", submissionId)
    .maybeSingle();

  const { data: result, error } = await supabase.rpc("link_public_submission", {
    p_submission_id: submissionId,
    p_person_id: personId,
  });
  if (error) return { error: error.message };

  const made = (result ?? {}) as {
    evidence_id?: string | null;
    holiday_request_id?: string | null;
    branch_id?: string | null;
    person_name?: string | null;
  };

  const answers = (submission?.answers ?? {}) as Record<string, unknown>;
  const startDate = isoOrNull(answers["start_date_of_holiday"]);
  const endDate = isoOrNull(answers["end_date_of_holiday"]);

  // Tell the approvers, exactly as an in-app request does. Best effort: a failed
  // email never undoes the link.
  if (made.holiday_request_id && startDate && endDate) {
    await notifyHolidayRequested({
      companyId: profile.company_id,
      branchId: made.branch_id ?? null,
      requestId: made.holiday_request_id,
      requesterName: made.person_name ?? "A team member",
      startDate,
      endDate,
    });
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "public_form.linked",
    entityType: "public_form_submission",
    entityId: submissionId,
    summary: `Linked a public ${submission?.form_key ?? "form"} submission to ${made.person_name ?? "a person"}`,
    metadata: {
      person_id: personId,
      evidence_id: made.evidence_id ?? null,
      holiday_request_id: made.holiday_request_id ?? null,
    },
  });

  revalidatePath("/people/submissions");
  revalidatePath("/people/holiday");
  return { ok: "Linked." };
}

/** Discard a submission that is spam or cannot be matched to anyone. */
export async function discardSubmission(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const submissionId = String(formData.get("submission_id") ?? "");
  if (!submissionId) return { error: "Missing submission." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_public_submission", {
    p_submission_id: submissionId,
  });
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "public_form.discarded",
    entityType: "public_form_submission",
    entityId: submissionId,
    summary: "Discarded a public form submission",
  });

  revalidatePath("/people/submissions");
  return { ok: "Discarded." };
}
