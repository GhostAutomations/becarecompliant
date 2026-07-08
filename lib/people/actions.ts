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
import { listPeopleCheckDefinitions, getPublishedFormVersion } from "./data";
import { initialDueDate, nextDueAfterCompletion, todayIso } from "./logic";

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
      profile_id: trimOrNull(formData.get("profile_id")),
      start_date,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "That person is already linked to a user account." };
    return { error: error.message };
  }

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
  if (!personId || !["active", "leaver"].includes(status)) return;

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
    action: status === "leaver" ? "person.left" : "person.reactivated",
    entityType: "person",
    entityId: personId,
    summary: status === "leaver" ? "Marked as a leaver" : "Reactivated record",
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
