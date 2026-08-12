"use server";

/**
 * Be Care Compliant — Incidents & Safeguarding server actions (THE LIST item 21).
 *
 * RLS (incidents_insert / incidents_update, migration 0174) is the real guard. The
 * role check here exists only so a Supervisor gets a sentence instead of a database
 * error. Available on EVERY tier including Business: recording an incident is a legal
 * duty for any provider regardless of what they pay us, so there is no feature gate.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { INCIDENT_STATUSES, type IncidentStatus } from "./types";
import { todayIso } from "./logic";

const MANAGE_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isoDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** An <input type="time"> gives HH:MM. Anything else is discarded rather than
 *  stored half-parsed. */
function timeOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}

function checked(v: FormDataEntryValue | null): boolean {
  return String(v ?? "") === "on" || String(v ?? "") === "true";
}

/** The escalation blocks, shared by create and update.
 *
 *  Unticking "notifiable" CLEARS the notification date and reference rather than
 *  leaving them behind. A stale notified_on under an unticked box is how a record
 *  ends up saying two different things, and the aggregate then reports whichever
 *  one it happens to read. */
function escalationFields(formData: FormData) {
  const notifiable = checked(formData.get("notifiable"));
  const safeguarding = checked(formData.get("safeguarding"));
  return {
    notifiable,
    notified_on: notifiable ? isoDateOrNull(formData.get("notified_on")) : null,
    regulator_reference: notifiable ? trimOrNull(formData.get("regulator_reference")) : null,
    safeguarding,
    safeguarding_referred_on: safeguarding
      ? isoDateOrNull(formData.get("safeguarding_referred_on"))
      : null,
    local_authority: safeguarding ? trimOrNull(formData.get("local_authority")) : null,
    local_authority_reference: safeguarding
      ? trimOrNull(formData.get("local_authority_reference"))
      : null,
    safeguarding_outcome: safeguarding ? trimOrNull(formData.get("safeguarding_outcome")) : null,
  };
}

/** Record an incident. */
export async function createIncident(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) {
    return { error: "You do not have permission to record incidents." };
  }
  const companyId = profile.company_id;

  const branch_id = String(formData.get("branch_id") ?? "").trim();
  const occurred_on = isoDateOrNull(formData.get("occurred_on"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!branch_id) return { error: "Choose a branch." };
  if (!occurred_on) return { error: "Enter the date the incident happened." };
  if (!category) return { error: "Choose a category." };
  if (!description) return { error: "Describe what happened." };

  const supabase = await createClient();
  const { data: incident, error } = await supabase
    .from("incidents")
    .insert({
      company_id: companyId,
      branch_id,
      occurred_on,
      occurred_at: timeOrNull(formData.get("occurred_at")),
      category,
      service_user_id: trimOrNull(formData.get("service_user_id")),
      person_id: trimOrNull(formData.get("person_id")),
      description,
      immediate_action: trimOrNull(formData.get("immediate_action")),
      ...escalationFields(formData),
      status: "open",
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
    action: "incident.created",
    entityType: "incident",
    entityId: incident.id,
    summary: `Recorded incident: ${category} on ${occurred_on}`,
    metadata: { branch_id, category, notifiable: checked(formData.get("notifiable")) },
  });

  revalidatePath("/incidents");
  return { ok: "Recorded", redirectTo: `/incidents/${incident.id}` };
}

/** Edit an incident's detail, escalation and learning fields. */
export async function updateIncident(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) {
    return { error: "You do not have permission to edit incidents." };
  }
  const id = String(formData.get("incident_id") ?? "").trim();
  if (!id) return { error: "Missing incident." };

  const occurred_on = isoDateOrNull(formData.get("occurred_on"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!occurred_on) return { error: "Enter the date the incident happened." };
  if (!category) return { error: "Choose a category." };
  if (!description) return { error: "Describe what happened." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("incidents")
    .update({
      occurred_on,
      occurred_at: timeOrNull(formData.get("occurred_at")),
      category,
      service_user_id: trimOrNull(formData.get("service_user_id")),
      person_id: trimOrNull(formData.get("person_id")),
      description,
      immediate_action: trimOrNull(formData.get("immediate_action")),
      ...escalationFields(formData),
      lessons_learnt: trimOrNull(formData.get("lessons_learnt")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "incident.updated",
    entityType: "incident",
    entityId: id,
    summary: `Updated incident: ${category} on ${occurred_on}`,
  });

  revalidatePath(`/incidents/${id}`);
  revalidatePath("/incidents");
  return { ok: "Saved" };
}

/** Move an incident through Open → Under review → Closed.
 *
 *  Closing does NOT clear an outstanding notification or referral: the duty survives
 *  the paperwork, and needsAction() in summary.ts still lists it. */
export async function setIncidentStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) {
    return { error: "You do not have permission to change an incident." };
  }
  const id = String(formData.get("incident_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as IncidentStatus;
  if (!id) return { error: "Missing incident." };
  if (!INCIDENT_STATUSES.includes(status)) return { error: "Choose a status." };

  const closed_on =
    status === "closed" ? isoDateOrNull(formData.get("closed_on")) ?? todayIso() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("incidents")
    .update({ status, closed_on, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "incident.status_changed",
    entityType: "incident",
    entityId: id,
    summary: `Incident marked ${status.replace("_", " ")}`,
    metadata: { status },
  });

  revalidatePath(`/incidents/${id}`);
  revalidatePath("/incidents");
  return { ok: "Saved" };
}
