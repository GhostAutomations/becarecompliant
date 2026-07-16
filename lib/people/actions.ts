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
import { requireCompany, requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import { type Answers, type FormSchema, firstDateFieldKey, isFormSchema } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import type { CheckDefinition } from "./types";
import { listPeopleCheckDefinitions, getPublishedFormVersion, getCompanyFormByKey } from "./data";
import {
  initialDueDate,
  nextDueAfterCompletion,
  todayIso,
  addDaysIso,
  TRACKER_FORMS,
  REGISTER_COLUMNS,
} from "./logic";
import { parseCivilDate } from "@/lib/recurrence";

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

  // Auto-apply active definitions. Only Spot Check gets a due date on add; the rest
  // (supervision, appraisal, manual handling, medication competency) start blank.
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

  // Probation: end due = start date + the company Probationary Period; status = Due.
  const { data: company } = await supabase
    .from("companies")
    .select("probation_period_days")
    .eq("id", companyId)
    .maybeSingle();
  const probEndDue = addDaysIso(start_date, (company?.probation_period_days as number | null) ?? 180);
  await supabase
    .from("person_trackers")
    .update({ probation_end_due: probEndDue, probation_status: "due", updated_by: user.id })
    .eq("person_id", person.id);

  // Assign the chosen supervisors to the caseload (auto-filled from the branch).
  const supervisorIds = formData.getAll("supervisor_ids").map(String).filter(Boolean);
  if (supervisorIds.length > 0) {
    await supabase.from("person_assignments").insert(
      supervisorIds.map((uid) => ({
        company_id: companyId,
        person_id: person.id,
        user_id: uid,
        created_by: user.id,
      })),
    );
  }

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
export async function transferPerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!personId || !branchId) return { error: "Choose a branch." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({ branch_id: branchId })
    .eq("id", personId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "No change was saved. You may not have permission." };
  }

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
  return { ok: "Transferred." };
}

/** Mark a Record as a leaver (excluded from the active register) or reactivate it. */
export async function setEmploymentStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!personId) return { error: "Missing record." };

  const supabase = await createClient();

  // "archive" is offered on the Status pill only in the Leavers view: it archives the
  // leaver (sets archived_at) rather than changing employment_status.
  if (status === "archive") {
    const { data, error: archErr } = await supabase
      .from("people")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", personId)
      .select("id");
    if (archErr) return { error: archErr.message };
    if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };
    await writeAudit({
      companyId: profile.company_id ?? "",
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "person.archived",
      entityType: "person",
      entityId: personId,
      summary: "Archived record",
    });
    revalidatePath(`/people/${personId}`);
    revalidatePath("/people");
    return { ok: "Archived." };
  }

  if (!["active", "mat_leave", "lts", "leaver"].includes(status)) {
    return { error: "Choose a valid status." };
  }

  const leaver_date = status === "leaver" ? todayIso() : null;
  // Setting a working status also un-archives: changing the Status pill (e.g. back to
  // Active) brings an archived person back into the relevant view, not stuck in Archive.
  const { data, error } = await supabase
    .from("people")
    .update({ employment_status: status, leaver_date, archived_at: null })
    .eq("id", personId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

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
  return { ok: "Saved." };
}

/** Archive or restore a Record. */
export async function setArchived(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const archive = String(formData.get("archive") ?? "") === "true";
  if (!personId) return { error: "Missing record." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", personId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

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
  return { ok: archive ? "Archived." : "Restored." };
}

/** Assign a user to a Record's caseload (Supervisor visibility). */
export async function assignSupervisor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!personId || !userId || !profile.company_id) return { error: "Choose a user to assign." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("person_assignments")
    .insert({ company_id: profile.company_id, person_id: personId, user_id: userId, created_by: user.id });
  if (error && error.code !== "23505") return { error: error.message };

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
  return { ok: "Assigned." };
}

export async function unassignSupervisor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!personId || !userId) return { error: "Missing assignment." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("person_assignments")
    .delete()
    .eq("person_id", personId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

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
  return { ok: "Removed." };
}

/** Re-apply any missing active definitions to a Record (idempotent). */
export async function applyMissingChecks(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId || !profile.company_id) return { error: "Missing record." };

  const supabase = await createClient();
  const { data: person } = await supabase.from("people").select("start_date").eq("id", personId).maybeSingle();
  const startDate = (person?.start_date as string | null) ?? null;

  const definitions = await listPeopleCheckDefinitions(profile.company_id);
  const rows = definitions.map((def) => ({
    definition_id: def.id,
    due_date: initialDueDate(def, startDate),
    expiry_date: null,
  }));
  const { error } = await supabase.rpc("apply_person_checks", { p_person_id: personId, p_rows: rows });
  if (error) return { error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: "Checks applied." };
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

  // Swap the form this check uses (past evidence keeps its own form/version).
  if (formData.has("form_id")) {
    const fid = String(formData.get("form_id") ?? "").trim();
    patch.form_id = fid === "" ? null : fid;
  }

  if (anchor === "expiry") {
    // The box is "days before expiry to flag" -> amber window.
    const flag = Number.parseInt(String(formData.get("flag_days") ?? "").trim(), 10);
    if (Number.isInteger(flag) && flag >= 0) patch.amber_days = flag;
  } else {
    // Recurring checks need a positive interval; a non-recurring check (e.g. Setup)
    // may be due before its anchor, so a negative day offset is allowed (never zero).
    const recurring = String(formData.get("recurring") ?? "1") === "1";
    const days = Number.parseInt(String(formData.get("days") ?? "").trim(), 10);
    if (Number.isInteger(days) && days !== 0 && (recurring ? days >= 1 : true)) {
      patch.frequency = "day";
      patch.interval = days;
    }
    const amberRaw = String(formData.get("amber_days") ?? "").trim();
    if (amberRaw === "") patch.amber_days = null;
    else {
      const amber = Number.parseInt(amberRaw, 10);
      if (Number.isInteger(amber) && amber >= 0) patch.amber_days = amber;
    }
    // Regulatory deadline for the on time (PQS) report. Blank clears it (grade against
    // the operational interval); a positive whole number of days sets it.
    const reportRaw = String(formData.get("reporting_days") ?? "").trim();
    if (reportRaw === "") patch.reporting_interval_days = null;
    else {
      const rep = Number.parseInt(reportRaw, 10);
      if (Number.isInteger(rep) && rep >= 1) patch.reporting_interval_days = rep;
    }
    const mode = String(formData.get("schedule_mode") ?? "");
    if (mode === "interval" || mode === "after_sup3") patch.schedule_mode = mode;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("check_definitions").update(patch).eq("id", definitionId);
  if (error) return { error: error.message };

  // Recompute the due date on carers who have NOT yet completed this check, so the
  // new schedule applies to existing records too (completion-anchor checks only).
  if (anchor !== "expiry") {
    const { data: defRow } = await supabase
      .from("check_definitions")
      .select("*")
      .eq("id", definitionId)
      .maybeSingle();
    if (defRow) {
      const def = defRow as CheckDefinition;
      let rows: Array<{ instance_id: string; due_date: string | null }> = [];
      if (def.population === "service_users") {
        // Service User checks anchor on the package start date, not a person start
        // date. Reschedule uncompleted instances via the SU initial-due rule so
        // editing a SU check config never nulls out its due dates.
        const { suInitialDueDate } = await import("@/lib/service-users/logic");
        const { data: insts } = await supabase
          .from("check_instances")
          .select("id, service_users(package_start_date)")
          .eq("definition_id", definitionId)
          .is("last_completed_on", null);
        type SuInstRow = {
          id: string;
          service_users:
            | { package_start_date: string | null }
            | Array<{ package_start_date: string | null }>
            | null;
        };
        rows = ((insts as SuInstRow[] | null) ?? []).map((i) => {
          const s = Array.isArray(i.service_users) ? i.service_users[0] : i.service_users;
          return { instance_id: i.id, due_date: suInitialDueDate(def, s?.package_start_date ?? null) };
        });
      } else {
        const { data: insts } = await supabase
          .from("check_instances")
          .select("id, people(start_date)")
          .eq("definition_id", definitionId)
          .is("last_completed_on", null);
        type InstRow = {
          id: string;
          people: { start_date: string | null } | Array<{ start_date: string | null }> | null;
        };
        rows = ((insts as InstRow[] | null) ?? []).map((i) => {
          const p = Array.isArray(i.people) ? i.people[0] : i.people;
          return { instance_id: i.id, due_date: initialDueDate(def, p?.start_date ?? null) };
        });
      }
      if (rows.length > 0) {
        await supabase.rpc("reschedule_check_instances", { p_definition_id: definitionId, p_rows: rows });
      }
    }
  }

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
  revalidatePath("/settings/service-users");
  revalidatePath("/service-users");
  return { ok: "Saved" };
}

function enumOrNull(v: FormDataEntryValue | null, allowed: string[]): string | null {
  const s = String(v ?? "").trim();
  return allowed.includes(s) ? s : null;
}

/**
 * Create a brand new form-completion CHECK TYPE tied to a form built in the form
 * builder (Phase 5). Company Admin only. Applies to existing active Records now
 * (blank due until first completion) and to all future Records. Both populations.
 */
export async function createCheckType(input: {
  population: "people" | "service_users";
  name: string;
  formId: string;
  frequency: "day" | "week" | "month" | "year";
  interval: number;
  amberDays?: number | null;
}): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const name = input.name.trim();
  if (!name) return { error: "Enter a check name." };
  if (input.population !== "people" && input.population !== "service_users") {
    return { error: "Choose who the check is for." };
  }
  if (!input.formId) return { error: "Choose the form this check completes." };
  if (!["day", "week", "month", "year"].includes(input.frequency)) {
    return { error: "Choose how often it recurs." };
  }
  if (!Number.isInteger(input.interval) || input.interval < 1) {
    return { error: "The interval must be a whole number of at least 1." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_check_definition_with_form", {
    p_company_id: companyId,
    p_population: input.population,
    p_name: name,
    p_form_id: input.formId,
    p_frequency: input.frequency,
    p_interval: input.interval,
    p_amber_days: input.amberDays ?? null,
  });
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "check_definition.created",
    entityType: "check_definition",
    entityId: (data as string) ?? null,
    summary: `Created check "${name}"`,
    metadata: {
      population: input.population,
      form_id: input.formId,
      frequency: input.frequency,
      interval: input.interval,
    },
  });

  revalidatePath("/settings/people");
  revalidatePath("/settings/service-users");
  revalidatePath("/people");
  revalidatePath("/service-users");
  return { ok: `Check "${name}" created.` };
}

/** Save the company Probationary Period (days). Applies to carers added afterwards;
 *  it deliberately does NOT recompute existing carers' probation dates. */
export async function updateProbationPeriod(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const days = Number.parseInt(String(formData.get("probation_period_days") ?? "").trim(), 10);
  if (!Number.isInteger(days) || days < 1) return { error: "Enter a number of days." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ probation_period_days: days })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.probation_period_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Set probationary period to ${days} days`,
    metadata: { days },
  });

  revalidatePath("/settings/people");
  return { ok: "Saved" };
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
export async function updateTracker(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing record." };

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
  const { data, error } = await supabase
    .from("person_trackers")
    .update(patch)
    .eq("person_id", personId)
    .select("person_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

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
  return { ok: "Saved." };
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

  // Stamp the mapped tracker dates (+ status) from the answers. Only touch a
  // column when the form actually captured that field: a form that omits a
  // date (e.g. probation end due is set at record creation, or a field hidden
  // by conditional logic) must never wipe the stored value.
  const patch: Record<string, unknown> = { updated_by: user.id };
  for (const [answerKey, column] of Object.entries(spec.dateFields)) {
    if (!(answerKey in answers)) continue;
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
  // Navigate client-side (see ActionState.redirectTo): a Server Action redirect()
  // to a URL with a query string trips Next.js issue #78396 (React #310).
  return { ok: "completed", redirectTo: `/people/${personId}?completed=${encodeURIComponent(spec.title)}` };
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

  // 2. Advance the Check: next due computed by the shared recurrence engine. For an
  // "after Supervision 3" appraisal, the interval comes from the Supervision box.
  const { data: supDef } = await supabase
    .from("check_definitions")
    .select("interval")
    .eq("company_id", instance.company_id as string)
    .eq("population", "people")
    .eq("key", "supervision")
    .maybeSingle();
  const supInterval = (supDef?.interval as number | null) ?? 90;
  // Completion date = the activity date captured on the form (the first date field,
  // e.g. Date of supervision / assessment / training) when present, else today. It
  // stamps last_completed and anchors the next due date, so a back-dated completion
  // schedules the next one correctly. Applies to every check, not just supervision.
  const dateKey = isFormSchema(version.schema) ? firstDateFieldKey(version.schema as FormSchema) : null;
  const dateAnswer = dateKey ? answers[dateKey] : undefined;
  const completedOnIso =
    typeof dateAnswer === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateAnswer) ? dateAnswer : todayIso();
  const { nextDue, expiry } = nextDueAfterCompletion(def, answers, supInterval, parseCivilDate(completedOnIso));
  const { error: advanceErr } = await supabase.rpc("complete_check", {
    p_instance_id: instanceId,
    p_completed_on: completedOnIso,
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

  // Completing an Annual Appraisal restarts the supervision cycle: re-anchor the
  // supervision check so its RAG reflects the new cycle (Sup 1 due = appraisal
  // completion + supervision interval, none completed yet). The display slots use
  // the same anchor (supervisionCycleAnchor), so screen and RAG stay in step.
  if (def.key === "appraisal") {
    const supDue = addDaysIso(completedOnIso, supInterval);
    if (supDue) {
      await supabase.rpc("reanchor_supervision_cycle", {
        p_person_id: instance.person_id as string,
        p_due_date: supDue,
      });
    }
  }

  // Completing Supervision 3 schedules an "After Supervision 3" appraisal: due one
  // supervision interval after the Sup 3 completion, keeping the cycle on cadence.
  if (def.key === "supervision" && String(answers.supervision_type ?? "") === "3") {
    const { data: apprDef } = await supabase
      .from("check_definitions")
      .select("schedule_mode")
      .eq("company_id", instance.company_id as string)
      .eq("population", "people")
      .eq("key", "appraisal")
      .maybeSingle();
    if ((apprDef?.schedule_mode as string | null) === "after_sup3") {
      const apprDue = addDaysIso(completedOnIso, supInterval);
      if (apprDue) {
        await supabase.rpc("set_person_check_due", {
          p_person_id: instance.person_id as string,
          p_check_key: "appraisal",
          p_due_date: apprDue,
        });
      }
    }
  }

  revalidatePath(`/people/${instance.person_id}`);
  revalidatePath("/people");
  // Navigate client-side (see ActionState.redirectTo): a Server Action redirect()
  // to a URL with a query string trips Next.js issue #78396 (React #310).
  return { ok: "completed", redirectTo: `/people/${instance.person_id}?completed=${encodeURIComponent(def.name)}` };
}
