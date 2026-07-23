"use server";

/**
 * Be Care Compliant — On Call department server actions (Phase 10 Additions).
 *
 * Shifts (the rota) and call logs are plain records, not the recurring check
 * engine. RLS (migration 0113) is the real guard: Supervisors and above plus the
 * On Call role, scoped by branch. The role checks here just give a clean message
 * before the database refuses. Datetimes are stored as entered (wall-clock,
 * normalised to a stable UTC instant) so the rota does not drift across DST.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/billing/tier";
import { slotInstants } from "@/lib/on-call/format";
import type { ActionState } from "@/lib/forms";

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

const CALLER_RELATIONSHIPS = ["service_user", "relative", "staff", "professional", "public", "other"];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/** A datetime-local value ("YYYY-MM-DDTHH:MM") normalised to a stable UTC instant.
 *  Stored and displayed in UTC so what you enter is what you see. */
function toInstant(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  return s.length === 16 ? `${s}:00Z` : `${s}Z`;
}

async function gate(): Promise<
  { error: string } | { ok: true; companyId: string; userId: string; role: string; email: string }
> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const feature = await requireFeature(profile.company_id, "on_call");
  if (feature) return { error: feature };
  if (!ONCALL_ROLES.includes(profile.role)) return { error: "You do not have permission to use On Call." };
  return { ok: true, companyId: profile.company_id, userId: user.id, role: profile.role, email: profile.email };
}

// ===========================================================================
// Rota (shifts)
// ===========================================================================
export async function createShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;

  const branch_id = String(formData.get("branch_id") ?? "").trim();
  const starts_at = toInstant(formData.get("starts_at"));
  const ends_at = toInstant(formData.get("ends_at"));
  if (!branch_id) return { error: "Choose a branch." };
  if (!starts_at) return { error: "Enter when the shift starts." };
  if (!ends_at) return { error: "Enter when the shift ends." };
  if (ends_at <= starts_at) return { error: "The end must be after the start." };

  const on_call_profile_id = trimOrNull(formData.get("on_call_profile_id"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("on_call_shifts")
    .insert({
      company_id: g.companyId,
      branch_id,
      on_call_profile_id,
      on_call_name: on_call_profile_id ? null : trimOrNull(formData.get("on_call_name")),
      phone: trimOrNull(formData.get("phone")),
      starts_at,
      ends_at,
      notes: trimOrNull(formData.get("notes")),
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAudit({
    companyId: g.companyId, actorId: g.userId, actorEmail: g.email, actorRole: g.role,
    action: "on_call.shift_created", entityType: "on_call_shift", entityId: data.id,
    summary: "Added an on-call rota shift", metadata: { branch_id },
  });
  revalidatePath("/on-call");
  return { ok: "Shift added." };
}

export async function updateShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing shift." };

  const branch_id = String(formData.get("branch_id") ?? "").trim();
  const starts_at = toInstant(formData.get("starts_at"));
  const ends_at = toInstant(formData.get("ends_at"));
  if (!branch_id) return { error: "Choose a branch." };
  if (!starts_at || !ends_at) return { error: "Enter the start and end." };
  if (ends_at <= starts_at) return { error: "The end must be after the start." };

  const on_call_profile_id = trimOrNull(formData.get("on_call_profile_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("on_call_shifts")
    .update({
      branch_id,
      on_call_profile_id,
      on_call_name: on_call_profile_id ? null : trimOrNull(formData.get("on_call_name")),
      phone: trimOrNull(formData.get("phone")),
      starts_at,
      ends_at,
      notes: trimOrNull(formData.get("notes")),
      updated_by: g.userId,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/on-call");
  return { ok: "Shift saved." };
}

export async function deleteShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing shift." };
  const supabase = await createClient();
  const { error } = await supabase.from("on_call_shifts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/on-call");
  return { ok: "Shift removed." };
}

// ===========================================================================
// Rota grid (AM / PM cells over 3 weeks)
// ===========================================================================
const SCOPE_ADMIN_ROLES = ["company_admin", "registered_individual", "registered_manager", "platform_admin"];

/** Assign (or reassign) one rota cell: a date + AM/PM slot, for a branch or the
 *  whole company. Replaces whatever was in that cell. */
export async function assignSlot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;

  const scope = String(formData.get("scope") ?? "branch") === "company" ? "company" : "branch";
  const branch_id = scope === "company" ? null : (trimOrNull(formData.get("branch_id")));
  const shift_date = String(formData.get("shift_date") ?? "").trim();
  const slot = String(formData.get("slot") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shift_date)) return { error: "Missing date." };
  if (slot !== "am" && slot !== "pm") return { error: "Missing slot." };
  if (scope === "branch" && !branch_id) return { error: "Choose a branch." };

  const on_call_profile_id = trimOrNull(formData.get("on_call_profile_id"));
  const on_call_name = on_call_profile_id ? null : trimOrNull(formData.get("on_call_name"));
  if (!on_call_profile_id && !on_call_name) return { error: "Choose who is on call." };

  const { startsAt, endsAt } = slotInstants(shift_date, slot);
  const supabase = await createClient();

  // Clear the existing cell first (delete-then-insert keeps the unique cell simple).
  let del = supabase.from("on_call_shifts").delete()
    .eq("company_id", g.companyId).eq("shift_date", shift_date).eq("slot", slot);
  del = scope === "company" ? del.is("branch_id", null) : del.eq("branch_id", branch_id!);
  await del;

  const { error } = await supabase.from("on_call_shifts").insert({
    company_id: g.companyId,
    branch_id,
    shift_date,
    slot,
    starts_at: startsAt,
    ends_at: endsAt,
    on_call_profile_id,
    on_call_name,
    phone: trimOrNull(formData.get("phone")),
    created_by: g.userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/on-call");
  return { ok: "Saved." };
}

/** Empty one rota cell. */
export async function clearSlot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const id = trimOrNull(formData.get("id"));
  if (!id) return { error: "Missing cell." };
  const supabase = await createClient();
  const { error } = await supabase.from("on_call_shifts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/on-call");
  return { ok: "Cleared." };
}

/** Switch how the company runs its rota (Admin only). */
export async function setRotaScope(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  if (!SCOPE_ADMIN_ROLES.includes(g.role)) return { error: "Only an Admin can change the rota scope." };
  const scope = String(formData.get("scope") ?? "") === "company" ? "company" : "branch";
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ on_call_rota_scope: scope }).eq("id", g.companyId);
  if (error) return { error: error.message };
  revalidatePath("/on-call");
  return { ok: "Rota scope updated." };
}

// ===========================================================================
// Call log
// ===========================================================================
function logFields(formData: FormData) {
  const rel = trimOrNull(formData.get("caller_relationship"));
  const handler_profile_id = trimOrNull(formData.get("handler_profile_id"));
  return {
    occurred_at: toInstant(formData.get("occurred_at")) ?? new Date().toISOString(),
    handler_profile_id,
    handler_name: handler_profile_id ? null : trimOrNull(formData.get("handler_name")),
    caller_name: trimOrNull(formData.get("caller_name")),
    caller_relationship: rel && CALLER_RELATIONSHIPS.includes(rel) ? rel : null,
    service_user_id: trimOrNull(formData.get("service_user_id")),
    category: trimOrNull(formData.get("category")),
    action_taken: trimOrNull(formData.get("action_taken")),
    outcome: trimOrNull(formData.get("outcome")),
    follow_up_required: formData.get("follow_up_required") === "on",
    follow_up_notes: trimOrNull(formData.get("follow_up_notes")),
  };
}

export async function createLog(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;

  const branch_id = String(formData.get("branch_id") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  if (!branch_id) return { error: "Choose a branch." };
  if (!details) return { error: "Describe what the call was about." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("on_call_logs")
    .insert({
      company_id: g.companyId,
      branch_id,
      shift_id: trimOrNull(formData.get("shift_id")),
      details,
      ...logFields(formData),
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // The call is filed: discard the in-progress draft.
  await supabase.from("on_call_log_drafts").delete().eq("user_id", g.userId);

  await writeAudit({
    companyId: g.companyId, actorId: g.userId, actorEmail: g.email, actorRole: g.role,
    action: "on_call.call_logged", entityType: "on_call_log", entityId: data.id,
    summary: "Logged an on-call call", metadata: { branch_id },
  });
  redirect(`/on-call/log/${data.id}`);
}

export async function updateLog(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const id = String(formData.get("id") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  if (!id) return { error: "Missing call." };
  if (!details) return { error: "Describe what the call was about." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("on_call_logs")
    .update({
      details,
      ...logFields(formData),
      follow_up_done: formData.get("follow_up_done") === "on",
      updated_by: g.userId,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/on-call/log/${id}`);
  revalidatePath("/on-call/log");
  return { ok: "Call saved." };
}

/** Autosave the in-progress "Log a call" form (per user, fire-and-forget from the
 *  client). Kept for up to 12 hours; survives logout. Silent on any problem so it
 *  never interrupts typing. */
export async function saveLogDraft(data: Record<string, string>): Promise<void> {
  const g = await gate();
  if ("error" in g) return;
  const supabase = await createClient();
  await supabase
    .from("on_call_log_drafts")
    .upsert(
      { user_id: g.userId, company_id: g.companyId, data, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

/** Discard the caller's saved draft (used when they clear the form). */
export async function clearLogDraft(): Promise<void> {
  const g = await gate();
  if ("error" in g) return;
  const supabase = await createClient();
  await supabase.from("on_call_log_drafts").delete().eq("user_id", g.userId);
}

/** Quick toggle from the register / drill-down: mark a follow-up done or reopen it. */
export async function setFollowUpDone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const id = String(formData.get("id") ?? "").trim();
  const done = formData.get("done") === "true";
  if (!id) return { error: "Missing call." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("on_call_logs")
    .update({ follow_up_done: done, updated_by: g.userId })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/on-call/log");
  revalidatePath(`/on-call/log/${id}`);
  return { ok: done ? "Marked as done." : "Reopened." };
}
