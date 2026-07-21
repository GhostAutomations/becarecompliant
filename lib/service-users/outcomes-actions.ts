"use server";

/**
 * Personal outcomes actions for a Service User (Birdie-style, rebuilt). Manager+ via
 * RLS. Each outcome is a rich record (title, detail, target date) tracked over time
 * with immutable progress updates. The outcome's status is derived from the latest
 * update; completing it moves it to the Achieved list; archiving soft-removes it.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import type { OutcomeProgress } from "./outcome-consts";

const PROGRESS: OutcomeProgress[] = ["progressing", "no_change", "regressing"];

function nowIso(): string {
  return new Date().toISOString();
}

/** Resolve + authorise the service user for an outcome action. Returns its company. */
async function loadServiceUser(serviceUserId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("company_id")
    .eq("id", serviceUserId)
    .maybeSingle();
  return { supabase, companyId: (data?.company_id as string | undefined) ?? null };
}

/** Create a new outcome (title required, optional detail + target date). */
export async function createOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const detail = (String(formData.get("detail") ?? "").trim().slice(0, 2000)) || null;
  const targetRaw = String(formData.get("target_date") ?? "").trim();
  const target_date = /^\d{4}-\d{2}-\d{2}$/.test(targetRaw) ? targetRaw : null;
  if (!serviceUserId) return { error: "Missing service user." };
  if (!title) return { error: "Give the outcome a title." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const { data: last } = await supabase
    .from("service_user_outcomes")
    .select("position")
    .eq("service_user_id", serviceUserId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("service_user_outcomes").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    title,
    detail,
    target_date,
    status: "working_towards",
    position,
    created_by: profile.id,
    updated_by: profile.id,
    updated_at: nowIso(),
  });
  if (error) return { error: "Could not add the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_added",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Added personal outcome: ${title}`,
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath(`/service-users/${serviceUserId}`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Outcome added" };
}

/** Edit an outcome's title / detail / target date. */
export async function editOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const detail = (String(formData.get("detail") ?? "").trim().slice(0, 2000)) || null;
  const targetRaw = String(formData.get("target_date") ?? "").trim();
  const target_date = /^\d{4}-\d{2}-\d{2}$/.test(targetRaw) ? targetRaw : null;
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };
  if (!title) return { error: "Give the outcome a title." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const { error } = await supabase
    .from("service_user_outcomes")
    .update({ title, detail, target_date, updated_by: profile.id, updated_at: nowIso() })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);
  if (error) return { error: "Could not save the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_edited",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Edited personal outcome: ${title}`,
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  return { ok: "Saved" };
}

/** Log a progress update against an outcome (progressing / no change / regressing).
 *  Sets the outcome's status and last-update stamp, and stores the update as evidence. */
export async function logOutcomeUpdate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const progress = String(formData.get("progress") ?? "") as OutcomeProgress;
  const note = (String(formData.get("note") ?? "").trim().slice(0, 2000)) || null;
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };
  if (!PROGRESS.includes(progress)) return { error: "Choose progressing, no change or regressing." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const at = nowIso();
  const { error: insErr } = await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    outcome_id: outcomeId,
    kind: "progress",
    progress,
    note,
    created_by: profile.id,
    author_name: profile.full_name || profile.email,
    created_at: at,
  });
  if (insErr) return { error: "Could not record the update. Please try again." };

  await supabase
    .from("service_user_outcomes")
    .update({ status: progress, last_update_at: at, updated_by: profile.id, updated_at: at })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_updated",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Logged an outcome progress update (${progress})`,
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Update recorded" };
}

/** Mark an outcome achieved (moves it to the Achieved list). */
export async function completeOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const note = (String(formData.get("note") ?? "").trim().slice(0, 2000)) || null;
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const at = nowIso();
  await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    outcome_id: outcomeId,
    kind: "completed",
    progress: null,
    note,
    created_by: profile.id,
    author_name: profile.full_name || profile.email,
    created_at: at,
  });
  const { error } = await supabase
    .from("service_user_outcomes")
    .update({ status: "achieved", achieved_at: at, last_update_at: at, updated_by: profile.id, updated_at: at })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);
  if (error) return { error: "Could not complete the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_achieved",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Marked a personal outcome achieved",
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Marked achieved" };
}

/** Reopen an achieved outcome back to active (status returns to working towards). */
export async function reopenOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const at = nowIso();
  await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    outcome_id: outcomeId,
    kind: "reopened",
    progress: null,
    note: null,
    created_by: profile.id,
    author_name: profile.full_name || profile.email,
    created_at: at,
  });
  const { error } = await supabase
    .from("service_user_outcomes")
    .update({ status: "working_towards", achieved_at: null, last_update_at: at, updated_by: profile.id, updated_at: at })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);
  if (error) return { error: "Could not reopen the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_reopened",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Reopened a personal outcome",
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Reopened" };
}

/** Archive (soft-remove) an outcome from all lists and counts. */
export async function archiveOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const { error } = await supabase
    .from("service_user_outcomes")
    .update({ archived_at: nowIso(), updated_by: profile.id, updated_at: nowIso() })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);
  if (error) return { error: "Could not remove the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_archived",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Removed a personal outcome",
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Removed" };
}

/** Save the company outcomes update cadence (months). Admin-only. */
export async function updateOutcomesReviewMonths(formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const months = Number.parseInt(String(formData.get("months") ?? "").trim(), 10);
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    return { error: "Enter a number of months between 1 and 24." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ outcomes_review_months: months })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.outcomes_review_months_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Set outcomes update cadence to ${months} month(s)`,
    metadata: { months },
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users/outcomes");
  return { ok: "Saved" };
}
