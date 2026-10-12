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
import { collectFormFiles, submitEvidence } from "@/lib/evidence/submit";
import { requireFeature } from "@/lib/billing/tier";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { getComplaintsConfig, getCompanyFormByKey } from "./data";
import { addBusinessOrCalendarDays, isFormalComplaint, todayIso } from "./logic";
import { CONCERN_TYPES, FORMALITY_TYPES, needsInitialResponse } from "./types";
import { getCompanyRow } from "@/lib/companies/row";
import { foreignLinkError } from "@/lib/companies/links";

/** Is the 0389 complaints work switched on for this company (Bevan first, then everyone)? */
async function complaintsV2(companyId: string): Promise<boolean> {
  const row = await getCompanyRow(companyId);
  return row?.complaints_v2 === true;
}
import { COMPLAINTS_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";


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

/**
 * Save which team members a complaint is about.
 *
 * Replaces the whole set rather than adding to it, so removing a name on the edit form
 * actually removes it. Scoped to people in THIS company: a person id from another tenant
 * arriving in a form post is dropped rather than trusted.
 *
 * Best effort by design. The complaint itself is already saved by the time this runs, and a
 * failure here must not lose the complaint; it is reported to the caller instead.
 */
async function saveComplaintPeople(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { companyId: string; complaintId: string; personIds: string[] },
): Promise<string | null> {
  const wanted = [...new Set(input.personIds.filter(Boolean))];

  const { data: valid } = await supabase
    .from("people")
    .select("id")
    .eq("company_id", input.companyId)
    .in("id", wanted.length > 0 ? wanted : ["00000000-0000-0000-0000-000000000000"]);
  const allowed = new Set(((valid ?? []) as Array<{ id: string }>).map((p) => p.id));

  const { error: delErr } = await supabase
    .from("complaint_people")
    .delete()
    .eq("complaint_id", input.complaintId);
  if (delErr) return "The complaint was saved, but the team members named on it were not.";

  if (allowed.size === 0) return null;
  const { error: insErr } = await supabase.from("complaint_people").insert(
    [...allowed].map((person_id) => ({
      company_id: input.companyId,
      complaint_id: input.complaintId,
      person_id,
    })),
  );
  if (insErr) return "The complaint was saved, but the team members named on it were not.";
  return null;
}

/** The team members ticked on a complaint form. */
function personIdsFrom(formData: FormData): string[] {
  return formData.getAll("person_ids").map((v) => String(v).trim()).filter(Boolean);
}

/** Log a complaint. The acknowledgement and response due dates default from the
 *  company timescales (cited CQC/CIW norms), and stay editable on the record. */
export async function createComplaint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "complaints");
  if (gate) return { error: gate };
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission to log complaints." };
  const companyId = profile.company_id;

  const subject = String(formData.get("subject") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();
  if (!subject) return { error: "Enter a short subject for the complaint." };
  if (!branch_id) return { error: "Choose a branch." };

  const date_raised = isoDateOrNull(formData.get("date_raised")) ?? todayIso();
  const relationship = trimOrNull(formData.get("complainant_relationship"));
  const config = await getComplaintsConfig(companyId);
  const intake = intakeFields(formData);
  // All complaints are acknowledged; only formal complaints get a response deadline.
  const formal = isFormalComplaint(intake.formality);
  /* Unless the category needs no initial response (0389, Settings, Complaints), in which case
     there is no due date to miss. */
  const needsAck = !(await complaintsV2(companyId)) || needsInitialResponse(intake.concern_type, config.no_initial_response);

  // The branch and service user must be this company's, whatever was posted (audit F12).
  const foreign = await foreignLinkError(companyId, {
    branchId: branch_id,
    serviceUserId: trimOrNull(formData.get("service_user_id")),
  });
  if (foreign) return { error: foreign };

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
      ...intake,
      service_user_id: trimOrNull(formData.get("service_user_id")),
      date_raised,
      date_occurred: isoDateOrNull(formData.get("date_occurred")),
      acknowledgement_due: needsAck
        ? addBusinessOrCalendarDays(date_raised, config.acknowledgement_days, config.count_working_days)
        : null,
      response_due: formal
        ? addBusinessOrCalendarDays(date_raised, config.response_days, config.count_working_days)
        : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const peopleNote = await saveComplaintPeople(supabase, {
    companyId,
    complaintId: complaint.id,
    personIds: personIdsFrom(formData),
  });

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.created",
    entityType: "complaint",
    entityId: complaint.id,
    summary: `Logged complaint: ${subject}`,
    metadata: { branch_id, team_members: personIdsFrom(formData).length },
  });
  if (peopleNote) return { error: peopleNote };

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

  // The service user must be this company's, whatever was posted (audit F12).
  const foreign = await foreignLinkError(profile.company_id, {
    serviceUserId: trimOrNull(formData.get("service_user_id")),
  });
  if (foreign) return { error: foreign };

  const supabase = await createClient();
  const intake = intakeFields(formData);
  const formal = isFormalComplaint(intake.formality);

  // Response deadline only exists for formal complaints. If it becomes formal without
  // one, derive it from the raised date; if it stops being formal, clear it.
  /* THE INITIAL RESPONSE FOLLOWS THE CATEGORY (0389): moving a complaint into a category that
     needs none clears its due date; moving it out of one gives it a due date from the raised
     date if it has none. A date already typed is kept. */
  let acknowledgementDue = isoDateOrNull(formData.get("acknowledgement_due"));
  if (await complaintsV2(profile.company_id)) {
    const cfg = await getComplaintsConfig(profile.company_id);
    if (!needsInitialResponse(intake.concern_type, cfg.no_initial_response)) {
      acknowledgementDue = null;
    } else if (!acknowledgementDue) {
      const { data: existing } = await supabase.from("complaints").select("date_raised").eq("id", id).maybeSingle();
      const raised = (existing?.date_raised as string | null) ?? todayIso();
      acknowledgementDue = addBusinessOrCalendarDays(raised, cfg.acknowledgement_days, cfg.count_working_days);
    }
  }

  let responseDue = isoDateOrNull(formData.get("response_due"));
  if (!formal) {
    responseDue = null;
  } else if (!responseDue) {
    const [{ data: existing }, config] = await Promise.all([
      supabase.from("complaints").select("date_raised").eq("id", id).maybeSingle(),
      getComplaintsConfig(profile.company_id),
    ]);
    const raised = (existing?.date_raised as string | null) ?? todayIso();
    responseDue = addBusinessOrCalendarDays(raised, config.response_days, config.count_working_days);
  }

  const { data, error } = await supabase
    .from("complaints")
    .update({
      subject,
      details: trimOrNull(formData.get("details")),
      complainant_name: trimOrNull(formData.get("complainant_name")),
      complainant_relationship: relationship && RELATIONSHIPS.includes(relationship) ? relationship : null,
      ...intake,
      service_user_id: trimOrNull(formData.get("service_user_id")),
      date_occurred: isoDateOrNull(formData.get("date_occurred")),
      date_acknowledged: isoDateOrNull(formData.get("date_acknowledged")),
      acknowledgement_due: acknowledgementDue,
      investigation_completed: isoDateOrNull(formData.get("investigation_completed")),
      response_due: responseDue,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  const peopleNote = await saveComplaintPeople(supabase, {
    companyId: profile.company_id,
    complaintId: id,
    personIds: personIdsFrom(formData),
  });

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
  if (peopleNote) return { error: peopleNote };

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

  /* With 0389 on, a complaint is closed by completing the Complaint Outcome, so the outcome is
     always written down. The status control no longer offers Closed; this refuses it anyway. */
  if (status === "closed" && (await complaintsV2(profile.company_id))) {
    const sb = await createClient();
    const { data: current } = await sb.from("complaints").select("status").eq("id", id).maybeSingle();
    if ((current?.status as string | undefined) === "closed") return { ok: "Saved." };
    return { error: "Close the complaint with the Complaint Outcome, so how it was resolved is recorded." };
  }

  const outcome = status === "closed" ? trimOrNull(formData.get("outcome")) : null;
  /* Was it upheld? Recorded only when closing, and left as null when nobody says, because
     an open complaint has no finding and "not upheld" is a finding. This is what keeps a
     team member's record honest: see lib/complaints/person-complaints.ts. */
  const upheldRaw = status === "closed" ? String(formData.get("upheld") ?? "").trim() : "";
  const upheld = upheldRaw === "yes" ? true : upheldRaw === "no" ? false : null;
  const update: Record<string, unknown> = {
    status,
    date_closed: status === "closed" ? todayIso() : null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (status === "closed") {
    update.outcome = outcome;
    update.upheld = upheld;
  }

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
    /* The uploaded files go with the form (found 2026-10-12: they were never passed on, so a
       complaint form kept only the file's name, and nothing could be attached to a response). */
    files: await collectFormFiles(formData),
  });
  if (!result.ok) return { error: result.error };

  // First response on an Open complaint moves it to In Progress.
  if (complaint.status === "open") {
    await supabase
      .from("complaints")
      .update({ status: "in_progress", updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", complaintId);
  }

  /* THE COMPLAINT OUTCOME CLOSES THE COMPLAINT (0389). The close date is the one on the form,
     the outcome is how it was resolved, and upheld is what the form says ("Not decided" stays
     undecided). Read from the answers that were stored, so the record and the Evidence agree. */
  if (formKey === "complaint_outcome") {
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const closedOn = /^\d{4}-\d{2}-\d{2}$/.test(str(answers.outcome_date)) ? str(answers.outcome_date) : todayIso();
    const upheldAnswer = str(answers.upheld);
    const { error: closeErr } = await supabase
      .from("complaints")
      .update({
        status: "closed",
        date_closed: closedOn,
        outcome: str(answers.resolution) || null,
        upheld: upheldAnswer === "yes" ? true : upheldAnswer === "no" ? false : null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", complaintId);
    if (closeErr) {
      return { error: `The outcome was saved as evidence, but the complaint could not be closed: ${closeErr.message}` };
    }
  }

  // Completing the Complaint Investigation form stamps the investigation completed
  // date (only if not already set).
  if (formKey === "complaints_concerns") {
    await supabase
      .from("complaints")
      .update({ investigation_completed: todayIso(), updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", complaintId)
      .is("investigation_completed", null);
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

  /* The categories that need an initial response, sent only by the 0389 settings form; anything
     not ticked needs none. An older form that does not send the set leaves it as it was. */
  const extra: Record<string, unknown> = {};
  if (formData.get("initial_response_set") === "1") {
    const ticked = new Set(formData.getAll("initial_response").map(String));
    extra.no_initial_response = (CONCERN_TYPES as readonly string[]).filter((t) => !ticked.has(t));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("complaints_config")
    .upsert(
      {
        ...extra,
        company_id: profile.company_id,
        acknowledgement_days: num("acknowledgement_days", 3),
        response_days: num("response_days", 25),
        amber_days: num("amber_days", 5),
        count_working_days: formData.get("count_working_days") === "on",
        ref_prefix: String(formData.get("ref_prefix") ?? "").trim().toUpperCase() || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
  if (error) return { error: error.message };

  /* Open complaints in a category that now needs no initial response drop the due date, so
     nothing goes red for a response the policy says is not needed. */
  if (Array.isArray(extra.no_initial_response) && (extra.no_initial_response as string[]).length > 0) {
    await supabase
      .from("complaints")
      .update({ acknowledgement_due: null, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("company_id", profile.company_id)
      .neq("status", "closed")
      .is("date_acknowledged", null)
      .in("concern_type", extra.no_initial_response as string[]);
  }

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
