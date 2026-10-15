"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";
import { isRotaOfficeRole } from "@/lib/rota/roles";
import { getCandidates, warningsFor } from "@/lib/rota/data";
import { textCarers, textSummary } from "@/lib/rota/notify";
import { addDaysIso, mondayOfIso } from "@/lib/rota/working-time";
import { dayLabel, hhmm, type RotaCandidate, type RotaWarning } from "@/lib/rota/types";

/**
 * Be Care Compliant: the rota's server actions (Rota and Visits Stage 1, Phil 2026-10-15).
 *
 * Every action checks the module is on for the company and the caller's role first; the database
 * functions check the module, the caller's branch and every rule again. A refusal comes back as
 * the database's own words in ActionState, never a silent no-op. Changes to published shifts text
 * the carers affected (lib/rota/notify.ts).
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

async function office() {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId || !(await rotaModuleOn(companyId)) || !isRotaOfficeRole(profile.role)) {
    return { error: "The rota is not available." as const };
  }
  return { user, profile, companyId };
}

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

/* No revalidatePath here on purpose: redrawing the page inside the action's reply was the step
   that intermittently came back 503 after the save had gone through, leaving the button stuck.
   The screens refresh themselves after a success (components/rota/rota-action.tsx), and other
   people's screens catch up through the live channel the rota tables broadcast on. */
function done(ok: string): ActionState {
  return { ok };
}

function warningLine(w: RotaWarning[]): string {
  return w.length ? ` Warnings recorded: ${w.map((x) => x.text).join(" ")}` : "";
}

async function shiftInfo(shiftId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_shifts")
    .select("id, branch_id, shift_date, start_time, end_time, status")
    .eq("id", shiftId)
    .maybeSingle();
  return data as { id: string; branch_id: string; shift_date: string; start_time: string; end_time: string; status: string } | null;
}

async function audit(g: { user: { id: string }; profile: { email: string; role: string }; companyId: string }, action: string, entityId: string, summary: string, metadata?: Record<string, unknown>) {
  await writeAudit({
    companyId: g.companyId,
    actorId: g.user.id,
    actorEmail: g.profile.email,
    actorRole: g.profile.role,
    action,
    entityType: "rota_shift",
    entityId,
    summary,
    metadata,
  });
}

/* ---------------------------------- Shifts ---------------------------------- */

export async function saveShiftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const shiftId = str(fd, "shift_id") || null;
  const branchId = str(fd, "branch_id");
  const date = str(fd, "shift_date");
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  const breakMin = Number(str(fd, "break_minutes") || "0");
  const headcount = Number(str(fd, "headcount") || "1");
  if (!UUID.test(branchId)) return { error: "Choose a branch." };
  if (!ISO.test(date)) return { error: "Choose the date." };
  if (!TIME.test(start) || !TIME.test(end)) return { error: "Enter a start and a finish time." };
  if (start === end) return { error: "The start and finish cannot be the same time." };
  if (!Number.isInteger(breakMin) || breakMin < 0 || breakMin > 240) return { error: "The break must be between 0 and 240 minutes." };
  if (!Number.isInteger(headcount) || headcount < 1 || headcount > 20) return { error: "People needed must be between 1 and 20." };
  const before = shiftId ? await shiftInfo(shiftId) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_save_shift", {
    p_id: shiftId, p_branch: branchId, p_date: date, p_start: start, p_end: end,
    p_break: breakMin, p_headcount: headcount, p_location: str(fd, "location") || null,
    p_notes: str(fd, "notes") || null, p_template: str(fd, "template_id") || null,
  });
  if (error) return { error: error.message };
  let extra = "";
  if (before?.status === "published") {
    const { data: on } = await supabase.from("rota_assignments").select("person_id").eq("shift_id", shiftId!).eq("status", "active");
    const ids = ((on as { person_id: string }[] | null) ?? []).map((r) => r.person_id);
    if (ids.length) extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId, personIds: ids, kind: "changed", sentBy: g.user.id, shiftId }))}.`;
  }
  if (!shiftId) await audit(g, "rota.shift_added", String(data), `Added a shift on ${dayLabel(date)}, ${start} to ${end}`);
  return done((shiftId ? "Shift saved." : "Shift added as a draft.") + extra);
}

export async function addFromTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const templateId = str(fd, "template_id");
  const date = str(fd, "shift_date");
  if (!UUID.test(templateId)) return { error: "Choose a template." };
  if (!ISO.test(date)) return { error: "Choose the date." };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("rota_shift_templates")
    .select("id, branch_id, start_time, end_time, break_minutes, headcount, location")
    .eq("id", templateId)
    .maybeSingle();
  const tpl = t as { id: string; branch_id: string; start_time: string; end_time: string; break_minutes: number; headcount: number; location: string | null } | null;
  if (!tpl) return { error: "That template could not be found." };
  const { error } = await supabase.rpc("rota_save_shift", {
    p_id: null, p_branch: tpl.branch_id, p_date: date, p_start: hhmm(tpl.start_time), p_end: hhmm(tpl.end_time),
    p_break: tpl.break_minutes, p_headcount: tpl.headcount, p_location: tpl.location, p_notes: null, p_template: tpl.id,
  });
  if (error) return { error: error.message };
  return done("Shift added as a draft.");
}

export async function cancelShiftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const shiftId = str(fd, "shift_id");
  if (!UUID.test(shiftId)) return { error: "That shift could not be found." };
  const info = await shiftInfo(shiftId);
  if (!info) return { error: "That shift could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_cancel_shift", { p_id: shiftId, p_reason: str(fd, "reason") || null });
  if (error) return { error: error.message };
  const rows = (data as { person_id: string; was_published: boolean }[] | null) ?? [];
  let extra = "";
  if (info.status === "published" && rows.length) {
    extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: info.branch_id, personIds: rows.map((r) => r.person_id), kind: "changed", sentBy: g.user.id, shiftId }))}.`;
  }
  await audit(g, "rota.shift_cancelled", shiftId, `Cancelled the shift on ${dayLabel(info.shift_date)}, ${hhmm(info.start_time)} to ${hhmm(info.end_time)}`, { people: rows.length });
  return done(`Shift cancelled.${extra}`);
}

export async function publishWeekAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const branchId = str(fd, "branch_id");
  const monday = str(fd, "monday");
  if (!UUID.test(branchId) || !ISO.test(monday)) return { error: "Choose a branch and a week." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_publish", { p_branch: branchId, p_from: monday, p_to: addDaysIso(monday, 6) });
  if (error) return { error: error.message };
  const ids = ((data as { person_id: string }[] | null) ?? []).map((r) => r.person_id);
  const outcome = await textCarers({ companyId: g.companyId, branchId, personIds: ids, kind: "published", sentBy: g.user.id, label: dayLabel(monday).replace(/^\w+ /, "") });
  await audit(g, "rota.week_published", branchId, `Published the rota for the week of ${dayLabel(monday)}`, { people: ids.length, texts_sent: outcome.sent });
  return done(`Week published. ${textSummary(outcome)}.`);
}

export async function copyWeekAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const branchId = str(fd, "branch_id");
  const to = str(fd, "monday");
  if (!UUID.test(branchId) || !ISO.test(to)) return { error: "Choose a branch and a week." };
  const from = addDaysIso(mondayOfIso(to), -7);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_copy_week", { p_branch: branchId, p_from_monday: from, p_to_monday: mondayOfIso(to) });
  if (error) return { error: error.message };
  const r = ((data as { shifts_copied: number; people_copied: number; people_left_off: number }[] | null) ?? [])[0];
  if (!r || r.shifts_copied === 0) return done("Nothing new to copy: last week's shifts are already here, or last week was empty.");
  return done(
    `Copied ${r.shifts_copied} shift${r.shifts_copied === 1 ? "" : "s"} from last week as drafts, with ${r.people_copied} ${r.people_copied === 1 ? "person" : "people"}.` +
      (r.people_left_off ? ` ${r.people_left_off} could not be put on again (unavailable or not compliant), so those places are open.` : ""),
  );
}

/* -------------------------------- Assignments ------------------------------- */

export async function getCandidatesAction(shiftId: string): Promise<{ candidates?: RotaCandidate[]; error?: string }> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  if (!UUID.test(shiftId)) return { error: "That shift could not be found." };
  try {
    return { candidates: await getCandidates(g.companyId, shiftId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The list could not be loaded." };
  }
}

export async function assignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const shiftId = str(fd, "shift_id");
  const personId = str(fd, "person_id");
  if (!UUID.test(shiftId) || !UUID.test(personId)) return { error: "Choose a person." };
  const info = await shiftInfo(shiftId);
  if (!info) return { error: "That shift could not be found." };
  const warnings = await warningsFor(g.companyId, shiftId, personId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_assign", { p_shift: shiftId, p_person: personId, p_warnings: warnings, p_via: "office" });
  if (error) return { error: error.message };
  let extra = "";
  if (info.status === "published") {
    extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: info.branch_id, personIds: [personId], kind: "changed", sentBy: g.user.id, shiftId }))}.`;
  }
  if (warnings.length) {
    await audit(g, "rota.assigned_with_warnings", String(data), `Put on the shift on ${dayLabel(info.shift_date)} despite warnings`, { person_id: personId, warnings });
  }
  return done(`Added to the shift.${warningLine(warnings)}${extra}`);
}

export async function unassignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const assignmentId = str(fd, "assignment_id");
  const shiftId = str(fd, "shift_id");
  if (!UUID.test(assignmentId) || !UUID.test(shiftId)) return { error: "That person is not on this shift." };
  const info = await shiftInfo(shiftId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_unassign", { p_assignment: assignmentId, p_reason: str(fd, "reason") || null });
  if (error) return { error: error.message };
  let extra = "";
  if (info?.status === "published" && data) {
    extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: info.branch_id, personIds: [String(data)], kind: "changed", sentBy: g.user.id, shiftId }))}.`;
  }
  return done(`Taken off the shift.${extra}`);
}

export async function handoverAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const assignmentId = str(fd, "assignment_id");
  const shiftId = str(fd, "shift_id");
  const toPerson = str(fd, "person_id");
  const fromPerson = str(fd, "from_person_id");
  if (!UUID.test(assignmentId) || !UUID.test(shiftId) || !UUID.test(toPerson)) return { error: "Choose who takes the shift." };
  const info = await shiftInfo(shiftId);
  const warnings = await warningsFor(g.companyId, shiftId, toPerson);
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_handover", { p_assignment: assignmentId, p_to_person: toPerson, p_warnings: warnings });
  if (error) return { error: error.message };
  let extra = "";
  if (info?.status === "published") {
    extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: info.branch_id, personIds: [toPerson, fromPerson].filter((x) => UUID.test(x)), kind: "changed", sentBy: g.user.id, shiftId }))}.`;
  }
  await audit(g, "rota.handed_over", shiftId, `Shift on ${info ? dayLabel(info.shift_date) : "a day"} handed over`, { from_person_id: fromPerson, to_person_id: toPerson, warnings });
  return done(`Shift handed over.${warningLine(warnings)}${extra}`);
}

export async function swapAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const a = str(fd, "assignment_a");
  const b = str(fd, "assignment_b");
  if (!UUID.test(a) || !UUID.test(b)) return { error: "Choose the two shifts to swap." };
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("rota_assignments")
    .select("id, person_id, branch_id, shift_id, rota_shifts(status)")
    .in("id", [a, b]);
  const { error } = await supabase.rpc("rota_swap", { p_a: a, p_b: b });
  if (error) return { error: error.message };
  type B = { id: string; person_id: string; branch_id: string; shift_id: string; rota_shifts: { status: string } | null };
  const rows = (before as unknown as B[] | null) ?? [];
  let extra = "";
  if (rows.some((r) => r.rota_shifts?.status === "published")) {
    extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: rows[0].branch_id, personIds: rows.map((r) => r.person_id), kind: "changed", sentBy: g.user.id }))}.`;
  }
  await audit(g, "rota.swapped", rows[0]?.shift_id ?? a, "Two people swapped shifts", { assignments: [a, b] });
  return done(`Shifts swapped.${extra}`);
}

/* ------------------------------ Open shift requests ------------------------- */

export async function decideRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const requestId = str(fd, "request_id");
  const approve = str(fd, "approve") === "yes";
  if (!UUID.test(requestId)) return { error: "That request could not be found." };
  const supabase = await createClient();
  const { data: req } = await supabase.from("rota_open_requests").select("shift_id, person_id, branch_id").eq("id", requestId).maybeSingle();
  const r = req as { shift_id: string; person_id: string; branch_id: string } | null;
  if (!r) return { error: "That request could not be found." };
  const warnings = approve ? await warningsFor(g.companyId, r.shift_id, r.person_id) : [];
  const { error } = await supabase.rpc("rota_decide_open_request", { p_request: requestId, p_approve: approve, p_note: str(fd, "note") || null, p_warnings: warnings });
  if (error) return { error: error.message };
  let extra = "";
  if (approve) {
    extra = ` ${textSummary(await textCarers({ companyId: g.companyId, branchId: r.branch_id, personIds: [r.person_id], kind: "changed", sentBy: g.user.id, shiftId: r.shift_id }))}.`;
  }
  return done((approve ? `Approved: they are on the shift.${warningLine(warnings)}` : "Declined.") + extra);
}

export async function offerShiftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const shiftId = str(fd, "shift_id");
  const picked = fd.getAll("person_id").map(String).filter((x) => UUID.test(x));
  if (!UUID.test(shiftId)) return { error: "That shift could not be found." };
  if (picked.length === 0) return { error: "Tick at least one person to text." };
  const info = await shiftInfo(shiftId);
  if (!info) return { error: "That shift could not be found." };
  if (info.status !== "published") return { error: "Publish the week first, so they can see the shift when they open the link." };
  // Only people who could actually take it are texted.
  const candidates = await getCandidates(g.companyId, shiftId);
  const allowed = new Set(candidates.filter((c) => !c.refusal).map((c) => c.personId));
  const ids = picked.filter((p) => allowed.has(p));
  if (ids.length === 0) return { error: "None of those people can take this shift." };
  const outcome = await textCarers({
    companyId: g.companyId, branchId: info.branch_id, personIds: ids, kind: "offer", sentBy: g.user.id, shiftId,
    label: `${dayLabel(info.shift_date)}, ${hhmm(info.start_time)} to ${hhmm(info.end_time)}`,
  });
  return done(`Offered. ${textSummary(outcome)}.`);
}

/* --------------------------------- Templates -------------------------------- */

export async function saveTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const id = str(fd, "template_id");
  const branchId = str(fd, "branch_id");
  const name = str(fd, "name");
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  const breakMin = Number(str(fd, "break_minutes") || "0");
  const headcount = Number(str(fd, "headcount") || "1");
  if (!UUID.test(branchId)) return { error: "Choose a branch." };
  if (!name) return { error: "Give the template a name, such as Early or Waking night." };
  if (!TIME.test(start) || !TIME.test(end) || start === end) return { error: "Enter a start and a finish time." };
  if (!Number.isInteger(breakMin) || breakMin < 0 || breakMin > 240) return { error: "The break must be between 0 and 240 minutes." };
  if (!Number.isInteger(headcount) || headcount < 1 || headcount > 20) return { error: "People needed must be between 1 and 20." };
  const row = {
    company_id: g.companyId, branch_id: branchId, name: name.slice(0, 80), start_time: start, end_time: end,
    break_minutes: breakMin, headcount, location: str(fd, "location") || null, updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("rota_shift_templates").update(row).eq("id", id).select("id")
    : await supabase.from("rota_shift_templates").insert({ ...row, created_by: g.user.id }).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That template could not be saved." };
  return done("Template saved.");
}

export async function archiveTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const id = str(fd, "template_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_shift_templates").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That template could not be found." };
  return done("Template removed. Shifts already made from it are kept.");
}

/* -------------------------------- Availability ------------------------------ */

async function personBranch(personId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("branch_id").eq("id", personId).maybeSingle();
  return (data as { branch_id: string } | null)?.branch_id ?? null;
}

export async function addPatternAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const personId = str(fd, "person_id");
  const weekday = Number(str(fd, "weekday"));
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  if (!UUID.test(personId)) return { error: "That person could not be found." };
  if (!(weekday >= 1 && weekday <= 7)) return { error: "Choose a day." };
  if (!TIME.test(start) || !TIME.test(end) || start === end) return { error: "Enter the times they can work." };
  const branchId = await personBranch(personId);
  if (!branchId) return { error: "That person could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("rota_availability").insert({ company_id: g.companyId, branch_id: branchId, person_id: personId, weekday, start_time: start, end_time: end, created_by: g.user.id });
  if (error) return { error: error.message };
  return done("Availability added.");
}

export async function removePatternAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_availability").delete().eq("id", str(fd, "id")).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That could not be found." };
  return done("Removed.");
}

export async function addUnavailableAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const personId = str(fd, "person_id");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date") || start;
  if (!UUID.test(personId)) return { error: "That person could not be found." };
  if (!ISO.test(start) || !ISO.test(end)) return { error: "Choose the dates." };
  if (end < start) return { error: "The last day cannot be before the first." };
  const branchId = await personBranch(personId);
  if (!branchId) return { error: "That person could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("rota_unavailable_dates").insert({ company_id: g.companyId, branch_id: branchId, person_id: personId, start_date: start, end_date: end, reason: str(fd, "reason") || null, created_by: g.user.id });
  if (error) return { error: error.message };
  return done("Dates added. They cannot be put on the rota on those days.");
}

export async function removeUnavailableAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_unavailable_dates").delete().eq("id", str(fd, "id")).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That could not be found." };
  return done("Removed.");
}

/** The 48 hour opt out: ticked once when they sign it, and kept (Phil, 2026-10-15). */
export async function setOptOutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const personId = str(fd, "person_id");
  const on = str(fd, "on") === "yes";
  if (!UUID.test(personId)) return { error: "That person could not be found." };
  const branchId = await personBranch(personId);
  if (!branchId) return { error: "That person could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("rota_person_settings").upsert(
    { person_id: personId, company_id: g.companyId, branch_id: branchId, opted_out_48h: on, opted_out_set_at: new Date().toISOString(), opted_out_set_by: g.user.id, updated_at: new Date().toISOString() },
    { onConflict: "person_id" },
  );
  if (error) return { error: error.message };
  await writeAudit({
    companyId: g.companyId, actorId: g.user.id, actorEmail: g.profile.email, actorRole: g.profile.role,
    action: on ? "rota.opt_out_signed" : "rota.opt_out_withdrawn", entityType: "person", entityId: personId,
    summary: on ? "Recorded the signed 48 hour opt out" : "Recorded that the 48 hour opt out was withdrawn",
  });
  return done(on ? "Opt out recorded." : "Opt out withdrawn.");
}

/* ----------------------------------- Carers --------------------------------- */

async function carer() {
  const { profile } = await requireCompany();
  if (!profile.company_id || !(await rotaModuleOn(profile.company_id))) return { error: "The rota is not available." as const };
  return { profile };
}

export async function requestOpenShiftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await carer();
  if ("error" in c) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_request_open_shift", { p_shift: str(fd, "shift_id") });
  if (error) return { error: error.message };
  return { ok: "Asked. The office will let you know." };
}

export async function withdrawOpenRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await carer();
  if ("error" in c) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_withdraw_open_request", { p_request: str(fd, "request_id") });
  if (error) return { error: error.message };
  return { ok: "Withdrawn." };
}
