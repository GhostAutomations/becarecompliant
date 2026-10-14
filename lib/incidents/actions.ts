"use server";

/**
 * Be Care Compliant — Incidents & Safeguarding server actions (THE LIST item 21).
 *
 * RLS (incidents_insert / incidents_update, 0174 and 0290) is the real guard. The role check
 * here exists only so somebody who may not record an incident gets a sentence instead of a
 * database error, and it now reads INCIDENTS_ROLES rather than keeping its own copy of the list.
 * A Supervisor is on it since 0290: she is usually the one who attended. Available on EVERY tier
 * including Business: recording an incident is a legal duty for any provider regardless of what
 * they pay us, so there is no feature gate.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { INCIDENT_STATUSES, type IncidentStatus } from "./types";
import { todayIso } from "./logic";
import { INCIDENTS_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";
import { foreignLinkError } from "@/lib/companies/links";
import { EVENT_TYPES } from "./report-answers";
import { riddorDateError } from "./case-display";


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

/** Type of event, the Other words and RIDDOR (0467), shared by create and update.
 *
 *  The type of event is required, except on a case that never had one: the cases filed before
 *  it was asked may stay blank and show Not recorded (Phil, 2026-10-14). The Other words are
 *  required when the kind is Other, except on a case already saved as Other without them.
 *  Answering RIDDOR No, or not at all, clears the HSE date and reference, as Notifiable does. */
function caseDetailFields(
  formData: FormData,
  category: string,
  occurredOn: string,
  before: { event_type: string | null; category: string | null; category_other: string | null } | null,
): { error: string } | {
  fields: {
    event_type: string | null;
    category_other: string | null;
    riddor_reportable: boolean | null;
    riddor_reported_on: string | null;
    riddor_reference: string | null;
  };
} {
  const eventType = String(formData.get("event_type") ?? "").trim();
  if (eventType && !(EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { error: "Choose the type of event." };
  }
  if (!eventType && (!before || before.event_type)) return { error: "Choose the type of event." };

  const other = category === "Other" ? trimOrNull(formData.get("category_other")) : null;
  const oldOtherWithoutWords = !!before && before.category === "Other" && !before.category_other;
  if (category === "Other" && !other && !oldOtherWithoutWords) {
    return { error: "Say what type of incident it was." };
  }
  if (other && other.length > 200) return { error: "Keep what type of incident it was to 200 characters." };

  const riddorAnswer = String(formData.get("riddor_reportable") ?? "").trim();
  const riddor = riddorAnswer === "yes" ? true : riddorAnswer === "no" ? false : null;
  const reportedOn = riddor ? isoDateOrNull(formData.get("riddor_reported_on")) : null;
  const dateError = riddorDateError(reportedOn, occurredOn, todayIso());
  if (dateError) return { error: dateError };
  const reference = riddor ? trimOrNull(formData.get("riddor_reference")) : null;
  if (reference && reference.length > 200) return { error: "Keep the HSE reference to 200 characters." };

  return {
    fields: {
      event_type: eventType || null,
      category_other: other,
      riddor_reportable: riddor,
      riddor_reported_on: reportedOn,
      riddor_reference: reference,
    },
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
  const detail = caseDetailFields(formData, category, occurred_on, null);
  if ("error" in detail) return { error: detail.error };

  // The branch, service user and team member must be this company's, whatever was posted (audit F12).
  const foreign = await foreignLinkError(companyId, {
    branchId: branch_id,
    serviceUserId: trimOrNull(formData.get("service_user_id")),
    personId: trimOrNull(formData.get("person_id")),
  });
  if (foreign) return { error: foreign };

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
      ...detail.fields,
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

  // The service user and team member must be this company's, whatever was posted (audit F12).
  const foreign = await foreignLinkError(profile.company_id, {
    serviceUserId: trimOrNull(formData.get("service_user_id")),
    personId: trimOrNull(formData.get("person_id")),
  });
  if (foreign) return { error: foreign };

  const supabase = await createClient();
  // What the case held before, so a case filed before 0467 is not made to answer what it never asked.
  const { data: before } = await supabase
    .from("incidents")
    .select("event_type, category, category_other")
    .eq("id", id)
    .maybeSingle<{ event_type: string | null; category: string | null; category_other: string | null }>();
  if (!before) return { error: "That incident could not be found." };
  const detail = caseDetailFields(formData, category, occurred_on, before);
  if ("error" in detail) return { error: detail.error };

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
      ...detail.fields,
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
