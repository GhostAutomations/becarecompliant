"use server";

/**
 * Be Care Compliant — People (Phase 3) server actions.
 *
 * The compliance loop lives in completeCheck: complete a Form -> Evidence via the
 * shared submitEvidence pipeline (record_type='person') -> complete_check advances
 * the Check (stamps completion, stores the evidence link, sets the next due date
 * computed by the shared recurrence engine). Everything is idempotent: applying a
 * definition twice never duplicates a check, and re-submitting the same evidence
 * never advances a check twice.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import type { CheckDefinition } from "./types";
import { listPeopleCheckDefinitions, getPublishedFormVersion, getCompanyFormByKey } from "./data";
import { initialDueDate, nextDueAfterCompletion, todayIso, TRACKER_FORMS, REGISTER_COLUMNS } from "./logic";

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isoDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Create a Person Record and auto-apply the company's active People checks,
 *  each with its initial due date computed from the start date. */
export async function createPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const full_name = String(formData.get("full_name") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();
  if (!full_name) return { error: "Enter the person's name." };
  if (!branch_id) return { error: "Choose a branch." };

  const start_date = isoDateOrNull(formData.get("start_date"));

  const supabase = await createClient();
  const { data: person, error } = await supabase
    .from("people")
    .insert({
      company_id: companyId,
      branch_id,
      full_name,
      job_title: trimOrNull(formData.get("job_title")),
      work_email: trimOrNull(formData.get("work_email")),
      mobile: trimOrNull(formData.get("mobile")),
      team: trimOrNull(formData.get("team")),
      manager_id: trimOrNull(formData.get("manager_id")),
      team_leader_id: trimOrNull(formData.get("team_leader_id")),
      start_date,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Auto-apply active definitions with their initial due dates (TS-computed).
  const definitions = await listPeopleCheckDefinitions(companyId);
  const rows = definitions.map((def: CheckDefinition) => ({
    definition_id: def.id,
    due_date: initialDueDate(def, start_date),
    expiry_date: null,
  }));
  const { data: applied, error: applyErr } = await supabase.rpc("apply_person_checks", {
    p_person_id: person.id,
    p_rows: rows,
  });

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.created",
    entityType: "person",
    entityId: person.id,
    summary: `Added ${full_name} to the People register`,
    metadata: { branch_id, checks_applied: applyErr ? 0 : (applied ?? 0) },
  });

  redirect(`/people/${person.id}`);
}

/** Edit a Record's identity / employment fields. */
export async function updatePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing record." };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Enter the person's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({
      full_name,
      job_title: trimOrNull(formData.get("job_title")),
      work_email: trimOrNull(formData.get("work_email")),
      mobile: trimOrNull(formData.get("mobile")),
      team: trimOrNull(formData.get("team")),
      manager_id: trimOrNull(formData.get("manager_id")),
      team_leader_id: trimOrNull(formData.get("team_leader_id")),
      start_date: isoDateOrNull(formData.get("start_date")),
    })
    .eq("id", personId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.updated",
    entityType: "person",
    entityId: personId,
    summary: `Updated ${full_name}`,
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { ok: "Saved." };
}

/** Transfer a Record to another branch (its checks follow via the DB trigger). */
export async function transferPerson(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!personId || !branchId) return;

  const supabase = await createClient();
  const { error } = await supabase.from("people").update({ branch_id: branchId }).eq("id", personId);
  if (error) return;

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.transferred",
    entityType: "person",
    entityId: personId,
    summary: `Transferred record to another branch`,
    metadata: { branch_id: branchId },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}

/** Mark a Record as a leaver (excluded from the active register) or reactivate it. */
export async function setEmploymentStatus(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!personId || !["active", "mat_leave", "lts", "leaver"].includes(status)) return;

  const supabase = await createClient();
  const leaver_date = status === "leaver" ? todayIso() : null;
  const { error } = await supabase
    .from("people")
    .update({ employment_status: status, leaver_date })
    .eq("id", personId);
  if (error) return;

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.status_changed",
    entityType: "person",
    entityId: personId,
    summary: `Set working status to ${status}`,
    metadata: { status },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}

/** Archive or restore a Record. */
export async function setArchived(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const archive = String(formData.get("archive") ?? "") === "true";
  if (!personId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", personId);
  if (error) return;

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: archive ? "person.archived" : "person.restored",
    entityType: "person",
    entityId: personId,
    summary: archive ? "Archived record" : "Restored record",
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}

/** Assign a user to a Record's caseload (Supervisor visibility). */
export async function assignSupervisor(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!personId || !userId || !profile.company_id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("person_assignments")
    .insert({ company_id: profile.company_id, person_id: personId, user_id: userId, created_by: user.id });
  if (error && error.code !== "23505") return;

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.assigned",
    entityType: "person",
    entityId: personId,
    summary: "Assigned a supervisor to the caseload",
    metadata: { user_id: userId },
  });

  revalidatePath(`/people/${personId}`);
}

export async function unassignSupervisor(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!personId || !userId) return;

  const supabase = await createClient();
  await supabase
    .from("person_assignments")
    .delete()
    .eq("person_id", personId)
    .eq("user_id", userId);

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.unassigned",
    entityType: "person",
    entityId: personId,
    summary: "Removed a supervisor from the caseload",
    metadata: { user_id: userId },
  });

  revalidatePath(`/people/${personId}`);
}

/** Re-apply any missing active definitions to a Record (idempotent). */
export async function applyMissingChecks(formData: FormData): Promise<void> {
  const { profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId || !profile.company_id) return;

  const supabase = await createClient();
  const { data: person } = await supabase.from("people").select("start_date").eq("id", personId).maybeSingle();
  const startDate = (person?.start_date as string | null) ?? null;

  const definitions = await listPeopleCheckDefinitions(profile.company_id);
  const rows = definitions.map((def) => ({
    definition_id: def.id,
    due_date: initialDueDate(def, startDate),
    expiry_date: null,
  }));
  await supabase.rpc("apply_person_checks", { p_person_id: personId, p_rows: rows });

  revalidatePath(`/people/${personId}`);
}

/** Adjust a People check from Settings: recurring checks store "every X days"
 *  (frequency=day, interval=days); expiry checks (right to work) store the number
 *  of days before the recorded expiry to flag (amber_days). Active toggles it on/off.
 *  Changes apply to future scheduling; the amber window affects RAG immediately. */
export async function updateCheckDefinition(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const definitionId = String(formData.get("definition_id") ?? "");
  if (!definitionId) return { error: "Missing check." };

  const anchor = String(formData.get("anchor") ?? "completion");
  const active = String(formData.get("active") ?? "") === "on";
  const patch: Record<string, unknown> = { active };

  if (anchor === "expiry") {
    // The box is "days before expiry to flag" -> amber window.
    const flag = Number.parseInt(String(formData.get("flag_days") ?? "").trim(), 10);
    if (Number.isInteger(flag) && flag >= 0) patch.amber_days = flag;
  } else {
    const days = Number.parseInt(String(formData.get("days") ?? "").trim(), 10);
    if (Number.isInteger(days) && days >= 1) {
      patch.frequency = "day";
      patch.interval = days;
    }
    const amberRaw = String(formData.get("amber_days") ?? "").trim();
    if (amberRaw === "") patch.amber_days = null;
    else {
      const amber = Number.parseInt(amberRaw, 10);
      if (Number.isInteger(amber) && amber >= 0) patch.amber_days = amber;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("check_definitions").update(patch).eq("id", definitionId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "check_definition.updated",
    entityType: "check_definition",
    entityId: definitionId,
    summary: "Updated a check configuration",
    metadata: { anchor, patch },
  });

  revalidatePath("/settings/people");
  revalidatePath("/people");
  return { ok: "Saved" };
}

function enumOrNull(v: FormDataEntryValue | null, allowed: string[]): string | null {
  const s = String(v ?? "").trim();
  return allowed.includes(s) ? s : null;
}

/** Save the per-company shorthand labels for the People register columns. Only
 *  non-empty shorthands are stored; clearing a box reverts to the default name. */
export async function updateColumnLabels(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const labels: Record<string, string> = {};
  for (const col of REGISTER_COLUMNS) {
    const v = String(formData.get(`col_${col.key}`) ?? "").trim();
    if (v) labels[col.key] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ people_column_labels: labels })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.column_labels_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: "Updated People register column shorthands",
  });

  revalidatePath("/settings/people");
  revalidatePath("/people");
  return { ok: "Saved" };
}

/** Save one tracker card (DBS, Right to Work or Probation) for a carer. Only the
 *  fields present in the submitted card are patched, so the three cards save
 *  independently. Managers/Admins only (RLS). Audit logged; no evidence form. */
export async function updateTracker(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return;

  const patch: Record<string, unknown> = { updated_by: user.id };
  const dateFields = [
    "dbs_date",
    "enhanced_dbs_date",
    "rtw_expiry_date",
    "probation_end_due",
    "probation_end_actual",
    "probation_extension_date",
  ];
  for (const f of dateFields) {
    if (formData.has(f)) patch[f] = isoDateOrNull(formData.get(f));
  }
  if (formData.has("rtw_limits")) {
    patch.rtw_limits = enumOrNull(formData.get("rtw_limits"), [
      "none",
      "20hrs_term",
      "20hrs_2nd_job",
      "visa_expires",
    ]);
  }
  if (formData.has("probation_status")) {
    patch.probation_status = enumOrNull(formData.get("probation_status"), [
      "passed",
      "failed",
      "extended",
      "due",
    ]);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("person_trackers").update(patch).eq("person_id", personId);
  if (error) return;

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.tracker_updated",
    entityType: "person",
    entityId: personId,
    summary: "Updated DBS, right to work and probation details",
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}

/**
 * Complete a document/tracker Form (DBS, Right to Work, Probation): store Evidence
 * through the shared pipeline, then stamp the mapped dates (and any status) into
 * person_trackers so the register shows them. Managers/Admins only (RLS).
 */
export async function completeTrackerForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const personId = String(formData.get("person_id") ?? "");
  const formKey = String(formData.get("form_key") ?? "");
  const spec = TRACKER_FORMS[formKey];
  if (!personId || !spec) return { error: "Unknown form." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("branch_id, company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That record could not be found." };

  const form = await getCompanyFormByKey(profile.company_id, formKey);
  if (!form) return { error: "This form is not available for your company." };

  const files: EvidenceFileInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) {
      files.push({
        fieldKey: key.slice(5),
        kind: "upload",
        fileName: value.name,
        contentType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
  }

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files,
    recordType: "person",
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };

  // Stamp the mapped tracker dates (+ status) from the answers.
  const patch: Record<string, unknown> = { updated_by: user.id };
  for (const [answerKey, column] of Object.entries(spec.dateFields)) {
    const v = answers[answerKey];
    patch[column] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }
  if (spec.statusFrom) {
    const sv = answers[spec.statusFrom.answer];
    if (typeof sv === "string" && sv) patch[spec.statusFrom.column] = sv;
  }
  await supabase.from("person_trackers").update(patch).eq("person_id", personId);

  await writeAudit({
    companyId: person.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "person.tracker_form_completed",
    entityType: "person",
    entityId: personId,
    summary: `Completed ${spec.title} form`,
    metadata: { form_key: formKey, evidence_id: result.evidenceId },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  redirect(`/people/${personId}?completed=${encodeURIComponent(spec.title)}`);
}

/**
 * THE COMPLIANCE LOOP. Complete a Check's Form: validate + store Evidence through
 * the shared pipeline, then advance the Check with the next due date from the
 * shared engine. Idempotent on the evidence id.
 */
export async function completeCheck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const instanceId = String(formData.get("instance_id") ?? "");
  if (!instanceId) return { error: "Missing check." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();

  // Load the instance + its definition (RLS scopes what the user can see).
  const { data: instance } = await supabase
    .from("check_instances")
    .select("id, person_id, branch_id, company_id, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();

  const def = (instance?.definition as CheckDefinition | undefined) ?? undefined;
  if (!instance || !def) return { error: "That check could not be found." };
  if (!def.form_id) return { error: "This check has no form to complete." };

  const version = await getPublishedFormVersion(def.form_id);
  if (!version) return { error: "This check's form has no published version." };

  // Collect uploaded files (file_upload fields; signatures travel in the answers).
  const files: EvidenceFileInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) {
      files.push({
        fieldKey: key.slice(5),
        kind: "upload",
        fileName: value.name,
        contentType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
  }

  // 1. Store immutable Evidence through the shared pipeline (validates authoritatively).
  const result = await submitEvidence({
    formVersionId: version.id,
    branchId: (instance.branch_id as string | null) ?? null,
    answers,
    files,
    recordType: "person",
    recordId: instance.person_id as string,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  // 2. Advance the Check: next due computed by the shared recurrence engine.
  const { nextDue, expiry } = nextDueAfterCompletion(def, answers);
  const { error: advanceErr } = await supabase.rpc("complete_check", {
    p_instance_id: instanceId,
    p_completed_on: todayIso(),
    p_evidence_id: result.evidenceId,
    p_next_due: nextDue,
    p_expiry_date: expiry,
  });
  if (advanceErr) {
    return {
      error: `Evidence was saved, but the check could not be advanced: ${advanceErr.message}`,
    };
  }

  await writeAudit({
    companyId: instance.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "check.completed",
    entityType: "check_instance",
    entityId: instanceId,
    summary: `Completed ${def.name}`,
    metadata: { evidence_id: result.evidenceId, next_due: nextDue, definition_id: def.id },
  });

  revalidatePath(`/people/${instance.person_id}`);
  revalidatePath("/people");
  redirect(`/people/${instance.person_id}?completed=${encodeURIComponent(def.name)}`);
}
