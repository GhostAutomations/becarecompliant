"use server";

/**
 * Be Care Compliant — Complaints (Phase 10 Additions) server actions.
 *
 * A complaint is a lifecycle case (Open / In Progress / Closed), not a recurring
 * check. Complaint forms are completed as immutable Evidence through the SAME
 * pipeline as everything else (submitEvidence, record_type = 'complaint'). RLS
 * (is_company_admin / is_branch_manager) is the real guard; the role checks here
 * give a clean message before the database refuses.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence } from "@/lib/evidence/submit";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { getComplaintsConfig, getCompanyFormByKey } from "./data";
import { addBusinessOrCalendarDays, todayIso } from "./logic";
import { CONCERN_TYPES, FORMALITY_TYPES } from "./types";

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

/** Parse the log-time intake fields (Complaint/Concern, Type, contact method) into a
 *  validated shape shared by create and update. */
function intakeFields(formData: FormData) {
  const concernRaw = String(formData.get("concern_type") ?? "").trim();
  const formalityRaw = String(formData.get("formality") ?? "").trim();
  const methodRaw = String(formData.get("contact_method") ?? "").trim();
  const contact_method = methodRaw === "email" || methodRaw === "post" ? methodRaw : null;
  return {
    concern_type: (CONCERN_TYPES as readonly string[]).includes(concernRaw) ? concernRaw : null,
    formality: (FORMALITY_TYPES as readonly string[]).includes(formalityRaw) ? formalityRaw : null,
    contact_method,
    contact_email: contact_method === "email" ? (String(formData.get("contact_email") ?? "").trim() || null) : null,
    contact_address: contact_method === "post" ? (String(formData.get("contact_address") ?? "").trim() || null) : null,
  };
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isoDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const RELATIONSHIPS = ["service_user", "relative", "staff", "professional", "public", "anonymous"];

/** Log a complaint. The acknowledgement and response due dates default from the
 *  company timescales (cited CQC/CIW norms), and stay editable on the record. */
export async function createComplaint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission to log complaints." };
  const companyId = profile.company_id;

  const subject = String(formData.get("subject") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();
  if (!subject) return { error: "Enter a short subject for the complaint." };
  if (!branch_id) return { error: "Choose a branch." };

  const date_raised = isoDateOrNull(formData.get("date_raised")) ?? todayIso();
  const relationship = trimOrNull(formData.get("complainant_relationship"));
  const config = await getComplaintsConfig(companyId);

  const supabase = await createClient();
  const { data: complaint, error } = await supabase
    .from("complaints")
    .insert({
      company_id: companyId,
      branch_id,
      subject,
      details: trimOrNull(formData.get("details")),
      complainant_name: trimOrNull(formData.get("complainant_name")),
      complainant_relationship: relationship && RELATIONSHIPS.includes(relationship) ? relationship : null,
      ...intakeFields(formData),
      service_user_id: trimOrNull(formData.get("service_user_id")),
      date_raised,
      date_occurred: isoDateOrNull(formData.get("date_occurred")),
      acknowledgement_due: addBusinessOrCalendarDays(date_raised, config.acknowledgement_days, config.count_working_days),
      response_due: addBusinessOrCalendarDays(date_raised, config.response_days, config.count_working_days),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.created",
    entityType: "complaint",
    entityId: complaint.id,
    summary: `Logged complaint: ${subject}`,
    metadata: { branch_id },
  });

  redirect(`/complaints/${complaint.id}`);
}

/** Edit a complaint's detail fields and lifecycle dates. */
export async function updateComplaint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  if (!id || !profile.company_id) return { error: "Missing complaint." };

  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { error: "Enter a short subject for the complaint." };
  const relationship = trimOrNull(formData.get("complainant_relationship"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("complaints")
    .update({
      subject,
      details: trimOrNull(formData.get("details")),
      complainant_name: trimOrNull(formData.get("complainant_name")),
      complainant_relationship: relationship && RELATIONSHIPS.includes(relationship) ? relationship : null,
      ...intakeFields(formData),
      service_user_id: trimOrNull(formData.get("service_user_id")),
      date_occurred: isoDateOrNull(formData.get("date_occurred")),
      date_acknowledged: isoDateOrNull(formData.get("date_acknowledged")),
      acknowledgement_due: isoDateOrNull(formData.get("acknowledgement_due")),
      investigation_completed: isoDateOrNull(formData.get("investigation_completed")),
      response_due: isoDateOrNull(formData.get("response_due")),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.updated",
    entityType: "complaint",
    entityId: id,
    summary: `Updated complaint: ${subject}`,
  });

  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  return { ok: "Saved." };
}

/** Move a complaint through Open / In Progress / Closed. Closing stamps the close
 *  date and captures the outcome; reopening clears the close date. */
export async function setComplaintStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !profile.company_id) return { error: "Missing complaint." };
  if (!["open", "in_progress", "closed"].includes(status)) return { error: "Choose a valid status." };

  const outcome = status === "closed" ? trimOrNull(formData.get("outcome")) : null;
  const update: Record<string, unknown> = {
    status,
    date_closed: status === "closed" ? todayIso() : null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (status === "closed") update.outcome = outcome;

  const supabase = await createClient();
  const { data, error } = await supabase.from("complaints").update(update).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.status_changed",
    entityType: "complaint",
    entityId: id,
    summary: `Set complaint status to ${status}`,
    metadata: { status },
  });

  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  return { ok: "Saved." };
}

/** Complete one of the complaint forms and store it as immutable Evidence against
 *  the complaint. An Open complaint moves to In Progress on the first response. */
export async function submitComplaintEvidence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const complaintId = String(formData.get("complaint_id") ?? "");
  const formKey = String(formData.get("form_key") ?? "");
  if (!complaintId || !formKey || !profile.company_id) return { error: "Missing complaint or form." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: complaint } = await supabase
    .from("complaints")
    .select("id, branch_id, status")
    .eq("id", complaintId)
    .maybeSingle();
  if (!complaint) return { error: "That complaint could not be found." };

  const form = await getCompanyFormByKey(profile.company_id, formKey);
  if (!form) return { error: "That form is not available. Import the latest templates from Settings." };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (complaint.branch_id as string | null) ?? null,
    answers,
    recordType: "complaint",
    recordId: complaintId,
  });
  if (!result.ok) return { error: result.error };

  // First response on an Open complaint moves it to In Progress.
  if (complaint.status === "open") {
    await supabase
      .from("complaints")
      .update({ status: "in_progress", updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", complaintId);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.evidence_added",
    entityType: "complaint",
    entityId: complaintId,
    summary: "Added a completed form as complaint evidence",
    metadata: { evidence_id: result.evidenceId, form_key: formKey },
  });

  revalidatePath(`/complaints/${complaintId}`);
  revalidatePath("/complaints");
  // Return ok WITHOUT redirectTo so the shared FormEvidenceDialog closes itself and
  // refreshes. (A redirectTo keeps the dialog open on "Saving…" because its busy
  // state stays true and it never calls setOpen(false) on the redirect path.)
  return { ok: "Evidence saved." };
}

/** Company Admin: save the complaint response timescales (Settings > Complaints). */
export async function updateComplaintsConfig(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (profile.role !== "company_admin" && profile.role !== "platform_admin") {
    return { error: "Only an Admin can change these settings." };
  }

  const num = (name: string, fallback: number) => {
    const n = Number.parseInt(String(formData.get(name) ?? "").trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("complaints_config")
    .upsert(
      {
        company_id: profile.company_id,
        acknowledgement_days: num("acknowledgement_days", 3),
        response_days: num("response_days", 25),
        amber_days: num("amber_days", 5),
        count_working_days: formData.get("count_working_days") === "on",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.complaints_config_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: "Updated complaint response timescales",
  });

  revalidatePath("/settings/complaints");
  return { ok: "Saved." };
}
