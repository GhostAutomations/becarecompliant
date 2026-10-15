"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";
import { isRotaOfficeRole } from "@/lib/rota/roles";
import { getVisitCandidates, visitWarningsFor } from "@/lib/rota/visits-data";
import { textCarers, textSummary } from "@/lib/rota/notify";
import { dayLabel, hhmm, type VisitCandidate } from "@/lib/rota/types";

/**
 * Be Care Compliant: the visit actions (Rota and Visits Stage 2, Phil 2026-10-15). The module and
 * role are checked here; the database functions check the module, the branch and every rule
 * again. Like Stage 1's actions they reply with their result only and the screen refreshes itself
 * (components/rota/rota-action.tsx). A change to a published visit texts the carers on it.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const TIME = /^\d{2}:\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function office() {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId || !(await rotaModuleOn(companyId)) || !isRotaOfficeRole(profile.role)) {
    return { error: "The rota is not available." as const };
  }
  return { user, profile, companyId };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function visitInfo(visitId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_visits")
    .select("id, branch_id, visit_date, start_time, end_time, status")
    .eq("id", visitId)
    .maybeSingle();
  return data as { id: string; branch_id: string; visit_date: string; start_time: string; end_time: string; status: string } | null;
}

/* ------------------------------- Call times ---------------------------------- */

export async function saveCallTimeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const su = str(fd, "service_user_id");
  const day = Number(str(fd, "day_of_week"));
  const occurrence = Number(str(fd, "occurrence"));
  const start = str(fd, "start_time");
  const lengthRaw = str(fd, "length_minutes");
  const length = lengthRaw ? Number(lengthRaw) : null;
  if (!UUID.test(su) || !(day >= 0 && day <= 6) || !(occurrence >= 1)) return { error: "That call could not be found." };
  if (start && !TIME.test(start)) return { error: "Enter the start time as hours and minutes." };
  if (length != null && (!Number.isInteger(length) || length < 5 || length > 1440)) return { error: "The length must be between 5 and 1440 minutes." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_save_call_time", {
    p_su: su, p_day: day, p_service: str(fd, "service"), p_slot: str(fd, "slot_key"), p_occurrence: occurrence,
    p_start: start || null, p_length: length,
  });
  if (error) return { error: error.message };
  // Bring the next 4 weeks of visits in line straight away.
  const { data: suRow } = await supabase.from("service_users").select("branch_id").eq("id", su).maybeSingle();
  const branchId = (suRow as { branch_id: string | null } | null)?.branch_id;
  let extra = "";
  if (branchId) {
    const { data: r } = await supabase.rpc("rota_refresh_visits", { p_branch: branchId });
    const row = ((r as { added: number; updated: number; cancelled: number; flagged: number }[] | null) ?? [])[0];
    if (row && (row.added || row.updated || row.cancelled || row.flagged)) {
      extra = ` Visits: ${row.added} added, ${row.updated} moved${row.cancelled ? `, ${row.cancelled} removed` : ""}${row.flagged ? `, ${row.flagged} already allocated so flagged for you to check` : ""}.`;
    }
  }
  return { ok: (start ? "Time saved." : "Time cleared.") + extra };
}

export async function refreshVisitsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const branchId = str(fd, "branch_id");
  if (!UUID.test(branchId)) return { error: "Choose a branch." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_refresh_visits", { p_branch: branchId });
  if (error) return { error: error.message };
  const r = ((data as { added: number; updated: number; cancelled: number; flagged: number }[] | null) ?? [])[0];
  if (!r || (!r.added && !r.updated && !r.cancelled && !r.flagged)) return { ok: "Visits are up to date with the Care Schedule." };
  return { ok: `Visits: ${r.added} added, ${r.updated} moved, ${r.cancelled} removed, ${r.flagged} flagged for you to check.` };
}

/* ------------------------------- Preferences --------------------------------- */

export async function addPrefAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const su = str(fd, "service_user_id");
  const person = str(fd, "person_id");
  const kind = str(fd, "kind");
  if (!UUID.test(su) || !UUID.test(person)) return { error: "Choose a person." };
  if (kind !== "preferred" && kind !== "not_to_send") return { error: "Choose preferred or not to send." };
  const supabase = await createClient();
  const { data: suRow } = await supabase.from("service_users").select("branch_id").eq("id", su).maybeSingle();
  const branchId = (suRow as { branch_id: string | null } | null)?.branch_id;
  if (!branchId) return { error: "That service user could not be found." };
  const { error } = await supabase
    .from("rota_su_carer_prefs")
    .upsert({ company_id: g.companyId, branch_id: branchId, service_user_id: su, person_id: person, kind, created_by: g.user.id }, { onConflict: "service_user_id,person_id" });
  if (error) return { error: error.message };
  await writeAudit({
    companyId: g.companyId, actorId: g.user.id, actorEmail: g.profile.email, actorRole: g.profile.role,
    action: kind === "preferred" ? "rota.carer_preferred" : "rota.carer_not_to_send", entityType: "service_user", entityId: su,
    summary: kind === "preferred" ? "Added a preferred carer" : "Added a carer to the not to send list", metadata: { person_id: person },
  });
  return { ok: "Saved." };
}

export async function removePrefAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rota_su_carer_prefs")
    .delete()
    .eq("service_user_id", str(fd, "service_user_id"))
    .eq("person_id", str(fd, "person_id"))
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That could not be found." };
  return { ok: "Removed." };
}

/* --------------------------------- Visits ------------------------------------ */

export async function getVisitCandidatesAction(visitId: string, movingAssignmentId?: string): Promise<{ candidates?: VisitCandidate[]; error?: string }> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  if (!UUID.test(visitId)) return { error: "That visit could not be found." };
  if (movingAssignmentId !== undefined && !UUID.test(movingAssignmentId)) return { error: "That carer is not on this visit." };
  try {
    return { candidates: await getVisitCandidates(g.companyId, visitId, movingAssignmentId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The list could not be loaded." };
  }
}

async function tellIfPublished(g: { companyId: string; user: { id: string } }, info: { branch_id: string; status: string } | null, personIds: string[]): Promise<string> {
  if (!info || info.status !== "published" || personIds.length === 0) return "";
  return ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: info.branch_id, personIds, kind: "changed", sentBy: g.user.id }))}.`;
}

export async function visitAssignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const visitId = str(fd, "visit_id");
  const personId = str(fd, "person_id");
  if (!UUID.test(visitId) || !UUID.test(personId)) return { error: "Choose a carer." };
  const info = await visitInfo(visitId);
  const warnings = await visitWarningsFor(g.companyId, visitId, personId, str(fd, "dbs") || undefined);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_visit_assign", { p_visit: visitId, p_person: personId, p_warnings: warnings, p_via: "office" });
  if (error) return { error: error.message };
  if (warnings.length) {
    await writeAudit({
      companyId: g.companyId, actorId: g.user.id, actorEmail: g.profile.email, actorRole: g.profile.role,
      action: "rota.visit_assigned_with_warnings", entityType: "rota_visit", entityId: String(data),
      summary: `Put on the visit on ${info ? dayLabel(info.visit_date) : "a day"} despite warnings`, metadata: { person_id: personId, warnings },
    });
  }
  const extra = await tellIfPublished(g, info, [personId]);
  return { ok: `Added to the visit.${warnings.length ? ` Warnings recorded: ${warnings.map((w) => w.text).join(" ")}` : ""}${extra}` };
}

export async function visitUnassignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const assignmentId = str(fd, "assignment_id");
  const visitId = str(fd, "visit_id");
  if (!UUID.test(assignmentId) || !UUID.test(visitId)) return { error: "That carer is not on this visit." };
  const info = await visitInfo(visitId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_visit_unassign", { p_assignment: assignmentId, p_reason: null });
  if (error) return { error: error.message };
  return { ok: `Taken off the visit.${await tellIfPublished(g, info, data ? [String(data)] : [])}` };
}

export async function visitMoveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const assignmentId = str(fd, "assignment_id");
  const visitId = str(fd, "visit_id");
  const toPerson = str(fd, "person_id");
  const fromPerson = str(fd, "from_person_id");
  if (!UUID.test(assignmentId) || !UUID.test(visitId) || !UUID.test(toPerson)) return { error: "Choose who takes the visit." };
  const info = await visitInfo(visitId);
  const warnings = await visitWarningsFor(g.companyId, visitId, toPerson, str(fd, "dbs") || undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_visit_move", { p_assignment: assignmentId, p_to_person: toPerson, p_warnings: warnings });
  if (error) return { error: error.message };
  const extra = await tellIfPublished(g, info, [toPerson, fromPerson].filter((x) => UUID.test(x)));
  return { ok: `Visit moved.${warnings.length ? ` Warnings recorded: ${warnings.map((w) => w.text).join(" ")}` : ""}${extra}` };
}

export async function moveRunAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const branchId = str(fd, "branch_id");
  const date = str(fd, "visit_date");
  const from = str(fd, "from_person_id");
  const to = str(fd, "person_id");
  if (!UUID.test(branchId) || !ISO.test(date) || !UUID.test(from) || !UUID.test(to)) return { error: "Choose who takes the run." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_move_run", { p_branch: branchId, p_date: date, p_from_person: from, p_to_person: to });
  if (error) return { error: error.message };
  const rows = (data as { visit_id: string; moved: boolean; reason: string | null }[] | null) ?? [];
  const moved = rows.filter((r) => r.moved).length;
  const left = rows.filter((r) => !r.moved);
  await writeAudit({
    companyId: g.companyId, actorId: g.user.id, actorEmail: g.profile.email, actorRole: g.profile.role,
    action: "rota.run_moved", entityType: "rota_run", entityId: branchId,
    summary: `Moved a run on ${dayLabel(date)}: ${moved} visit${moved === 1 ? "" : "s"} moved, ${left.length} left`, metadata: { from_person_id: from, to_person_id: to },
  });
  let extra = "";
  if (moved > 0) {
    const { data: pub } = await supabase.from("rota_visits").select("id").in("id", rows.filter((r) => r.moved).map((r) => r.visit_id)).eq("status", "published");
    if ((pub as { id: string }[] | null)?.length) {
      extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId, personIds: [from, to], kind: "changed", sentBy: g.user.id }))}.`;
    }
  }
  return {
    ok: `${moved} visit${moved === 1 ? "" : "s"} moved.${left.length ? ` ${left.length} could not move: ${left.map((l) => l.reason).join(" ")}` : ""}${extra}`,
  };
}

export async function cancelVisitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const visitId = str(fd, "visit_id");
  if (!UUID.test(visitId)) return { error: "That visit could not be found." };
  const info = await visitInfo(visitId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_cancel_visit", { p_visit: visitId, p_reason: str(fd, "reason") || null });
  if (error) return { error: error.message };
  const people = ((data as { person_id: string }[] | null) ?? []).map((r) => r.person_id);
  await writeAudit({
    companyId: g.companyId, actorId: g.user.id, actorEmail: g.profile.email, actorRole: g.profile.role,
    action: "rota.visit_cancelled", entityType: "rota_visit", entityId: visitId,
    summary: `Cancelled the visit on ${info ? `${dayLabel(info.visit_date)}, ${hhmm(info.start_time)}` : "a day"}`,
  });
  return { ok: `Visit cancelled.${await tellIfPublished(g, info, people)}` };
}

export async function clearVisitFlagAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_visit_clear_flag", { p_visit: str(fd, "visit_id") });
  if (error) return { error: error.message };
  return { ok: "Checked." };
}
