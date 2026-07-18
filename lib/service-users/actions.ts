"use server";

/**
 * Be Care Compliant — Service Users (Phase 4) server actions.
 *
 * The compliance loop lives in completeCheck: complete a Form -> Evidence via the
 * shared submitEvidence pipeline (record_type='service_user') -> complete_check
 * advances the Check (stamps completion, stores the evidence link, sets the next
 * due date from the shared recurrence engine). Everything is idempotent.
 *
 * Special-category data: reads of a Service User Record and its evidence are audit
 * logged in the pages that render them (writeAudit), not just writes here.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { sendCalendarInvite } from "@/lib/notifications/invites";
import { escapeHtml } from "@/lib/email/templates";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import { type Answers, type FormSchema, firstDateFieldKey, isFormSchema } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import type { CheckDefinition } from "@/lib/people/types";
import { parseCivilDate } from "@/lib/recurrence";
import { nextDueAfterCompletion } from "@/lib/people/logic";
import {
  listServiceUserCheckDefinitions,
  getPublishedFormVersion,
} from "./data";
import { initialDueDate, todayIso, addDaysToIso } from "./logic";
import { SU_REGISTER_COLUMNS } from "./types";
import { uploadCarePlanFile, signCarePlan } from "./care-plan";

/** The branch Service User type + company Complex review interval, so care plan
 *  reviews on a Complex branch schedule at the Complex cadence (default 80 days). */
async function complexReviewContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  branchId: string,
): Promise<{ isComplex: boolean; intervalDays: number }> {
  const [{ data: branch }, { data: company }] = await Promise.all([
    supabase.from("branches").select("service_user_type").eq("id", branchId).maybeSingle(),
    supabase.from("companies").select("complex_review_interval_days").eq("id", companyId).maybeSingle(),
  ]);
  return {
    isComplex: (branch?.service_user_type as string | null) === "complex",
    intervalDays: (company?.complex_review_interval_days as number | null) ?? 80,
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

/** Create a Service User Record and auto-apply the company's active SU checks, each
 *  with its initial due date computed from the package start date. */
export async function createServiceUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const full_name = String(formData.get("full_name") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();
  if (!full_name) return { error: "Enter the service user's name." };
  if (!branch_id) return { error: "Choose a branch." };

  const ssid = trimOrNull(formData.get("ssid"));
  const package_start_date = isoDateOrNull(formData.get("package_start_date"));

  const supabase = await createClient();
  const { data: su, error } = await supabase
    .from("service_users")
    .insert({
      company_id: companyId,
      branch_id,
      full_name,
      ssid,
      package_start_date,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "That SSID is already used in your company." };
    return { error: error.message };
  }

  // Auto-apply active definitions, each scheduled from the package start date. On a
  // Complex branch the Care Plan Review (REV1) is due at the Complex cadence.
  const definitions = await listServiceUserCheckDefinitions(companyId);
  const { isComplex, intervalDays } = await complexReviewContext(supabase, companyId, branch_id);
  const rows = definitions.map((def: CheckDefinition) => ({
    definition_id: def.id,
    due_date:
      def.key === "care_plan_review" && isComplex
        ? addDaysToIso(package_start_date, intervalDays)
        : initialDueDate(def, package_start_date),
    expiry_date: null,
  }));
  const { data: applied, error: applyErr } = await supabase.rpc("apply_service_user_checks", {
    p_service_user_id: su.id,
    p_rows: rows,
  });

  // Optional Care Plan document uploaded on the Add form. If they do not have it yet
  // they can add it later on the Setup form or the record.
  const carePlan = formData.get("care_plan");
  if (carePlan instanceof File && carePlan.size > 0) {
    const up = await uploadCarePlanFile(companyId, su.id, carePlan);
    if (up.ok) {
      await supabase
        .from("service_users")
        .update({ care_plan_path: up.path, care_plan_uploaded_at: new Date().toISOString() })
        .eq("id", su.id);
    }
  }

  // Assign the chosen users to the caseload (auto-filled from the branch).
  const assigneeIds = formData.getAll("supervisor_ids").map(String).filter(Boolean);
  if (assigneeIds.length > 0) {
    await supabase.from("service_user_assignments").insert(
      assigneeIds.map((uid) => ({
        company_id: companyId,
        service_user_id: su.id,
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
    action: "service_user.created",
    entityType: "service_user",
    entityId: su.id,
    summary: `Added ${full_name} to the Service User register`,
    metadata: { branch_id, checks_applied: applyErr ? 0 : (applied ?? 0) },
  });

  redirect(`/service-users/${su.id}`);
}

/** Edit a Record's identity fields. */
export async function updateServiceUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  if (!id) return { error: "Missing record." };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Enter the service user's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_users")
    .update({
      full_name,
      ssid: trimOrNull(formData.get("ssid")),
      package_start_date: isoDateOrNull(formData.get("package_start_date")),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That SSID is already used in your company." };
    return { error: error.message };
  }

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.updated",
    entityType: "service_user",
    entityId: id,
    summary: `Updated ${full_name}`,
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Saved." };
}

/** Transfer a Record to another branch (its checks follow via the DB trigger). */
export async function transferServiceUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!id || !branchId) return { error: "Choose a branch." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_users")
    .update({ branch_id: branchId })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.transferred",
    entityType: "service_user",
    entityId: id,
    summary: "Transferred record to another branch",
    metadata: { branch_id: branchId },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Transferred." };
}

/** Change the service status (active / hospital / respite / cancelled), or archive a
 *  cancelled Record. Cancelled excludes the Record from the active register, rollups,
 *  dashboard and reminders (kept for audit), exactly like a People leaver. */
export async function setServiceStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id) return { error: "Missing record." };

  const supabase = await createClient();

  // "archive" is offered on the Status pill only in the Cancelled view: it archives
  // the cancelled Record (sets archived_at) rather than changing service_status.
  if (status === "archive") {
    const { data, error: archErr } = await supabase
      .from("service_users")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (archErr) return { error: archErr.message };
    if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };
    await writeAudit({
      companyId: profile.company_id ?? "",
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "service_user.archived",
      entityType: "service_user",
      entityId: id,
      summary: "Archived record",
    });
    revalidatePath(`/service-users/${id}`);
    revalidatePath("/service-users");
    return { ok: "Archived." };
  }

  if (!["active", "hospital", "respite", "cancelled"].includes(status)) {
    return { error: "Choose a valid status." };
  }

  const discharge_date = status === "cancelled" ? todayIso() : null;
  // Setting a status also un-archives, so changing the pill (e.g. back to Active)
  // brings an archived Record back into the relevant view, not stuck in Archive.
  const { data, error } = await supabase
    .from("service_users")
    .update({ service_status: status, discharge_date, archived_at: null })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.status_changed",
    entityType: "service_user",
    entityId: id,
    summary: `Set service status to ${status}`,
    metadata: { status },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Saved." };
}

/** Book the next Care Plan Review: set the Planned Review Date and the reviewer who
 *  will complete it. Review Status derives to "Booked In" from this (until the due
 *  date passes). Booking also emails the reviewer a branded calendar invite with an
 *  .ics attachment (Phase 6); the email silently no-ops when Resend is not
 *  configured and the outcome lands in the audit metadata either way.
 *  Pass an empty date to clear a booking. */
export async function bookReview(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  if (!id || !profile.company_id) return;

  const plannedDate = isoDateOrNull(formData.get("planned_review_date"));
  const reviewerId = trimOrNull(formData.get("planned_reviewer_id"));
  const rawTime = String(formData.get("planned_review_time") ?? "").trim();
  const plannedTime = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : null;
  const rawDuration = Number.parseInt(String(formData.get("planned_review_duration") ?? ""), 10);
  const plannedDuration =
    Number.isFinite(rawDuration) && rawDuration >= 15 && rawDuration <= 480 ? rawDuration : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_user_trackers")
    .update({
      planned_review_date: plannedDate,
      planned_review_time: plannedDate ? plannedTime : null,
      planned_review_duration_minutes: plannedDate && plannedTime ? plannedDuration : null,
      planned_reviewer_id: plannedDate ? reviewerId : null,
      planned_review_booked_at: plannedDate ? new Date().toISOString() : null,
      updated_by: user.id,
    })
    .eq("service_user_id", id);
  if (error) return;

  // Reviewer calendar invite (carried from Phase 4). Idempotent per service
  // user + date + reviewer, so re-saving the same booking never re-sends and
  // a changed date sends a fresh invitation.
  let inviteOutcome = "not_applicable";
  if (plannedDate && reviewerId) {
    const [{ data: reviewer }, { data: su }, { data: company }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("id", reviewerId).maybeSingle(),
      supabase.from("service_users").select("full_name, branch_id").eq("id", id).maybeSingle(),
      supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle(),
    ]);
    if (reviewer?.email && su) {
      const result = await sendCalendarInvite({
        companyId: profile.company_id,
        branchId: (su.branch_id as string | null) ?? null,
        companyName: company?.name ?? "Be Care Compliant",
        kind: "su_review_invite",
        // Time is part of the key: rebooking the same slot never re-sends, a
        // changed date OR time sends a fresh invitation.
        dedupeKey: `su_review:${id}:${plannedDate}:${plannedTime ?? "allday"}:${reviewerId}`,
        recipient: {
          profileId: reviewer.id,
          name: reviewer.full_name || reviewer.email,
          email: reviewer.email,
        },
        eventTitle: `Care Plan Review: ${su.full_name}`,
        dateIso: plannedDate,
        timeHHMM: plannedTime,
        durationMinutes: plannedDuration ?? (plannedTime ? 60 : null),
        detailHtml: `<p style="margin:0;">You are booked to complete the Care Plan Review for <strong style="color:#ffffff;">${escapeHtml(String(su.full_name))}</strong>. The review form is in the Service Users section.</p>`,
        icsUid: `su-review-${id}-${plannedDate}-${(plannedTime ?? "allday").replace(":", "")}@becarecompliant.com`,
      });
      inviteOutcome = result.sent
        ? "sent"
        : result.deduped
          ? "already_sent"
          : result.skippedReason
            ? "skipped_no_email_config"
            : `failed: ${result.error}`;
    } else {
      inviteOutcome = "skipped_no_reviewer_email";
    }
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: plannedDate ? "service_user.review_booked" : "service_user.review_unbooked",
    entityType: "service_user",
    entityId: id,
    summary: plannedDate ? `Booked a review for ${plannedDate}` : "Cleared the planned review",
    metadata: {
      planned_review_date: plannedDate,
      planned_review_time: plannedTime,
      planned_review_duration_minutes: plannedDuration,
      planned_reviewer_id: reviewerId,
      invite_email: inviteOutcome,
    },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
}

/** Assign a user to a Record's caseload (visibility for that user). */
export async function assignServiceUserSupervisor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!id || !userId || !profile.company_id) return { error: "Choose a user to assign." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_user_assignments")
    .insert({ company_id: profile.company_id, service_user_id: id, user_id: userId, created_by: user.id });
  if (error && error.code !== "23505") return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.assigned",
    entityType: "service_user",
    entityId: id,
    summary: "Assigned a user to the caseload",
    metadata: { user_id: userId },
  });

  revalidatePath(`/service-users/${id}`);
  return { ok: "Assigned." };
}

/** Remove a user from a Record's caseload. */
export async function unassignServiceUserSupervisor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!id || !userId) return { error: "Missing assignment." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_user_assignments")
    .delete()
    .eq("service_user_id", id)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.unassigned",
    entityType: "service_user",
    entityId: id,
    summary: "Removed a user from the caseload",
    metadata: { user_id: userId },
  });

  revalidatePath(`/service-users/${id}`);
  return { ok: "Removed." };
}

/** Apply any active SU definitions this Record is missing (idempotent). */
export async function applyMissingChecks(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  if (!id || !profile.company_id) return { error: "Missing record." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("package_start_date")
    .eq("id", id)
    .maybeSingle();
  const definitions = await listServiceUserCheckDefinitions(profile.company_id);
  const rows = definitions.map((def) => ({
    definition_id: def.id,
    due_date: initialDueDate(def, (su?.package_start_date as string | null) ?? null),
    expiry_date: null,
  }));
  const { error } = await supabase.rpc("apply_service_user_checks", { p_service_user_id: id, p_rows: rows });
  if (error) return { error: error.message };

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Checks applied." };
}

/**
 * THE COMPLIANCE LOOP. Complete a Check's Form: validate + store Evidence through
 * the shared pipeline, then advance the Check with the next due date from the shared
 * engine. Idempotent on the evidence id. Completing a Care Plan Review clears any
 * Planned Review Date booking (the booked review has now happened).
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
  const { data: instance } = await supabase
    .from("check_instances")
    .select("id, service_user_id, branch_id, company_id, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();

  const def = (instance?.definition as CheckDefinition | undefined) ?? undefined;
  if (!instance || !def || !instance.service_user_id) return { error: "That check could not be found." };
  if (!def.form_id) return { error: "This check has no form to complete." };

  const version = await getPublishedFormVersion(def.form_id);
  if (!version) return { error: "This check's form has no published version." };

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
    recordType: "service_user",
    recordId: instance.service_user_id as string,
  });
  if (!result.ok) return { error: result.error };

  // 2. Advance the Check: completion date = the activity date captured on the form
  // (e.g. Date of review) when present, else today; it anchors the next due date so a
  // back-dated completion schedules the next one correctly.
  const dateKey = isFormSchema(version.schema) ? firstDateFieldKey(version.schema as FormSchema) : null;
  const dateAnswer = dateKey ? answers[dateKey] : undefined;
  const completedOnIso =
    typeof dateAnswer === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateAnswer) ? dateAnswer : todayIso();
  const advance = nextDueAfterCompletion(def, answers, null, parseCivilDate(completedOnIso));
  let nextDue = advance.nextDue;
  const expiry = advance.expiry;
  // On a Complex branch, the Care Plan Review advances at the Complex cadence (default
  // 80 days), so the next REV slot / rollup RAG is scheduled correctly.
  if (def.key === "care_plan_review") {
    const ctx = await complexReviewContext(
      supabase,
      instance.company_id as string,
      (instance.branch_id as string | null) ?? "",
    );
    if (ctx.isComplex) nextDue = addDaysToIso(completedOnIso, ctx.intervalDays);
  }
  const { error: advanceErr } = await supabase.rpc("complete_check", {
    p_instance_id: instanceId,
    p_completed_on: completedOnIso,
    p_evidence_id: result.evidenceId,
    p_next_due: nextDue,
    p_expiry_date: expiry,
  });
  if (advanceErr) {
    return { error: `Evidence was saved, but the check could not be advanced: ${advanceErr.message}` };
  }

  // Completing the Care Plan Review fulfils any booking, so clear the Planned Review
  // Date; Review Status then derives from the new New Review Due date.
  if (def.key === "care_plan_review") {
    await supabase
      .from("service_user_trackers")
      .update({
        planned_review_date: null,
        planned_reviewer_id: null,
        planned_review_booked_at: null,
        updated_by: user.id,
      })
      .eq("service_user_id", instance.service_user_id as string);
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
    metadata: { evidence_id: result.evidenceId, next_due: nextDue, definition_id: def.id, record_type: "service_user" },
  });

  revalidatePath(`/service-users/${instance.service_user_id}`);
  revalidatePath("/service-users");
  // Navigate client-side (see ActionState.redirectTo): a Server Action redirect() to a
  // URL with a query string trips Next.js issue #78396 (React #310).
  return {
    ok: "completed",
    redirectTo: `/service-users/${instance.service_user_id}?completed=${encodeURIComponent(def.name)}`,
  };
}

/** Save the company Complex review interval (days) used for the REV1-4 cadence on
 *  Complex branches. Applies to future scheduling. */
export async function updateComplexReviewInterval(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const days = Number.parseInt(String(formData.get("days") ?? "").trim(), 10);
  if (!Number.isInteger(days) || days < 1) return { error: "Enter a number of days." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ complex_review_interval_days: days })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.complex_review_interval_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Set Complex review interval to ${days} days`,
    metadata: { days },
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users");
  return { ok: "Saved" };
}

/** Set a branch's Service User type (Simple or Complex). Company Admin only, enforced
 *  by the branches_update RLS policy. */
export async function setBranchServiceUserType(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const branchId = String(formData.get("branch_id") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!branchId || !["simple", "complex"].includes(type)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ service_user_type: type })
    .eq("id", branchId);
  if (error) return;

  // Re-anchor every Service User's Care Plan Review due date in this branch to the new
  // mode's cadence: Complex uses the company Complex interval, Simple the Care Plan
  // Review definition interval. The register slots recompute from the completion
  // history automatically; this keeps the RAG rollup correct.
  let intervalDays = 365;
  if (type === "complex") {
    const { data: company } = await supabase
      .from("companies")
      .select("complex_review_interval_days")
      .eq("id", profile.company_id ?? "")
      .maybeSingle();
    intervalDays = (company?.complex_review_interval_days as number | null) ?? 80;
  } else {
    const { data: def } = await supabase
      .from("check_definitions")
      .select("interval")
      .eq("company_id", profile.company_id ?? "")
      .eq("population", "service_users")
      .eq("key", "care_plan_review")
      .maybeSingle();
    intervalDays = (def?.interval as number | null) ?? 365;
  }
  await supabase.rpc("reschedule_branch_reviews", {
    p_branch_id: branchId,
    p_interval_days: intervalDays,
  });

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "branch.service_user_type_set",
    entityType: "branch",
    entityId: branchId,
    summary: `Set Service User type to ${type}`,
    metadata: { type, interval_days: intervalDays },
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users");
}

/** Save the per-company shorthand labels for the Service User register columns. */
export async function updateServiceUserColumnLabels(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const labels: Record<string, string> = {};
  for (const col of SU_REGISTER_COLUMNS) {
    const v = String(formData.get(`col_${col.key}`) ?? "").trim();
    if (v) labels[col.key] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ service_user_column_labels: labels })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.su_column_labels_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: "Updated Service User register column names",
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users");
  return { ok: "Saved" };
}

/** Upload (or replace) a Service User's Care Plan document. */
export async function uploadCarePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const suId = String(formData.get("service_user_id") ?? "");
  const file = formData.get("care_plan");
  if (!suId) return { error: "Missing record." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a Care Plan file to upload." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("id, company_id")
    .eq("id", suId)
    .maybeSingle();
  if (!su) return { error: "That record could not be found." };

  const up = await uploadCarePlanFile(su.company_id as string, su.id as string, file);
  if (!up.ok) return { error: up.error };

  const { data, error } = await supabase
    .from("service_users")
    .update({ care_plan_path: up.path, care_plan_uploaded_at: new Date().toISOString() })
    .eq("id", suId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: su.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_plan_uploaded",
    entityType: "service_user",
    entityId: suId,
    summary: "Uploaded a care plan document",
  });

  revalidatePath(`/service-users/${suId}`);
  return { ok: "Care plan uploaded." };
}

/** Signed URL to view a Service User's Care Plan (RLS-checked read, then service-role sign). */
export async function getCarePlanUrl(
  serviceUserId: string,
): Promise<{ url?: string; error?: string }> {
  const { user, profile } = await requireCompany();
  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("company_id, care_plan_path")
    .eq("id", serviceUserId)
    .maybeSingle();
  const path = (su?.care_plan_path as string | null) ?? null;
  if (!su || !path) return { error: "No care plan on file." };
  const res = await signCarePlan(path);
  if (!res.ok) return { error: res.error };
  await writeAudit({
    companyId: su.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_plan_downloaded",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Viewed a care plan document",
  });
  return { url: res.url };
}
