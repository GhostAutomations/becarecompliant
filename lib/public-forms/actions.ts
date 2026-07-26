"use server";

/**
 * Be Care Compliant — public form admin + queue actions (signed in).
 *
 *   createPublicLink / setPublicLinkEnabled : a Company Admin publishes or
 *     withdraws the short link for one form.
 *   linkSubmission / discardSubmission      : a Manager or Admin clears an
 *     unmatched submission from the queue.
 *
 * The public submit path is NOT here: it lives with the public page and runs
 * through the service role, because it has no session to authorise.
 */

import { revalidatePath } from "next/cache";
import { requireCompany, requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { publicFormDef } from "@/lib/public-forms/config";
import { notifyHolidayRequested } from "@/lib/notifications/holiday";

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Publish (or re-publish) the short link for a form. */
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
  const { error } = await supabase
    .from("public_form_links")
    .upsert(
      {
        company_id: profile.company_id,
        form_key: formKey,
        enabled: true,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,form_key" },
    );
  if (error) return { error: `The link could not be created: ${error.message}` };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "public_form.published",
    entityType: "public_form_link",
    entityId: null,
    summary: `Published the ${def.label} form as a public link`,
    metadata: { form_key: formKey },
  });

  revalidatePath("/settings/public-forms");
  return { ok: "Link created." };
}

/** Switch a published link on or off without losing its history. */
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
      evidence_id: (result as { evidence_id?: string })?.evidence_id ?? null,
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
