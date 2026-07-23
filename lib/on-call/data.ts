import "server-only";

/**
 * Be Care Compliant — On Call department server data access. All reads go through
 * the RLS-scoped user client (migration 0113), so Supervisors/Managers see their
 * branch(es), company-wide seniors and the On Call role see every branch.
 */

import { createClient } from "@/lib/supabase/server";
import type { BranchOption, OnCallLog, OnCallShift, PersonOption, RotaCell, RotaScope } from "./types";

/** Normalise a Supabase to-one embedded relation (typed as an array) to one row. */
function relOne<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const ALL_BRANCH_ROLES = ["company_admin", "registered_individual", "registered_manager", "platform_admin", "on_call"];

/** Branches the user may book a shift / log a call against. Company-wide roles and
 *  the On Call role get every active branch; Managers/Supervisors get their own.
 *  (The standard branch helper returns nothing for the branchless On Call role,
 *  so On Call is handled explicitly here.) */
export async function getOnCallBranches(
  companyId: string,
  role: string,
  userId: string,
): Promise<BranchOption[]> {
  const supabase = await createClient();
  let ids: string[] | null = null;
  if (!ALL_BRANCH_ROLES.includes(role)) {
    const { data: ubs } = await supabase.from("user_branches").select("branch_id").eq("user_id", userId);
    ids = ((ubs as Array<{ branch_id: string }> | null) ?? []).map((r) => r.branch_id);
    if (ids.length === 0) return [];
  }
  let query = supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("kind", "branch")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (ids) query = query.in("id", ids);
  const { data } = await query;
  return (data as BranchOption[] | null) ?? [];
}

/** Active users in the company, for the "on call person" and "call handler"
 *  dropdowns. Falls back gracefully to an empty list if RLS hides profiles. */
export async function getCompanyPeopleOptions(companyId: string): Promise<PersonOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("full_name", { ascending: true });
  return ((data as Array<{ id: string; full_name: string | null; email: string | null }> | null) ?? []).map((p) => ({
    id: p.id,
    name: p.full_name || p.email || "Unknown",
  }));
}

type ShiftRow = {
  id: string; company_id: string; branch_id: string | null;
  on_call_profile_id: string | null; on_call_name: string | null; phone: string | null;
  starts_at: string; ends_at: string; shift_date: string | null; slot: "am" | "pm" | null; notes: string | null;
  branches: { name: string } | { name: string }[] | null;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function toShift(r: ShiftRow): OnCallShift {
  const branch = relOne(r.branches);
  const prof = relOne(r.profiles);
  const profName = prof ? prof.full_name || prof.email : null;
  return {
    id: r.id, company_id: r.company_id, branch_id: r.branch_id,
    branch_name: branch?.name ?? null,
    on_call_profile_id: r.on_call_profile_id,
    on_call_person_name: profName || r.on_call_name || null,
    on_call_name: r.on_call_name,
    phone: r.phone, starts_at: r.starts_at, ends_at: r.ends_at,
    shift_date: r.shift_date, slot: r.slot, notes: r.notes,
  };
}

const SHIFT_SELECT =
  "id, company_id, branch_id, on_call_profile_id, on_call_name, phone, starts_at, ends_at, shift_date, slot, notes, branches(name), profiles:on_call_profile_id(full_name, email)";

/** How this company runs its on-call rota: one grid per branch, or company-wide. */
export async function getRotaScope(companyId: string): Promise<RotaScope> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("on_call_rota_scope").eq("id", companyId).maybeSingle();
  return ((data?.on_call_rota_scope as RotaScope | null) ?? "branch");
}

/** The filled rota cells for a 3-week window, keyed `${shift_date}|${slot}`.
 *  scope "company" reads the branch-less rota; "branch" reads one branch. */
export async function getRotaGrid(
  companyId: string,
  scope: RotaScope,
  branchId: string | null,
  firstDate: string,
  lastDate: string,
): Promise<Map<string, RotaCell>> {
  const supabase = await createClient();
  let q = supabase
    .from("on_call_shifts")
    .select(SHIFT_SELECT)
    .eq("company_id", companyId)
    .gte("shift_date", firstDate)
    .lte("shift_date", lastDate);
  q = scope === "company" ? q.is("branch_id", null) : q.eq("branch_id", branchId ?? "");
  const { data } = await q;
  const map = new Map<string, RotaCell>();
  for (const raw of (data as ShiftRow[] | null) ?? []) {
    const s = toShift(raw);
    if (!s.shift_date || !s.slot) continue;
    map.set(`${s.shift_date}|${s.slot}`, {
      id: s.id, name: s.on_call_person_name, phone: s.phone, profileId: s.on_call_profile_id,
    });
  }
  return map;
}

/** Shifts ending today or in the future, soonest first (the rota looks forward). */
export async function getRota(companyId: string): Promise<OnCallShift[]> {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("on_call_shifts")
    .select(SHIFT_SELECT)
    .eq("company_id", companyId)
    .gte("ends_at", cutoff)
    .order("starts_at", { ascending: true });
  return ((data as ShiftRow[] | null) ?? []).map(toShift);
}

/** The shift(s) live right now (started, not yet ended). */
export async function getCurrentOnCall(companyId: string): Promise<OnCallShift[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("on_call_shifts")
    .select(SHIFT_SELECT)
    .eq("company_id", companyId)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("branch_id", { ascending: true });
  return ((data as ShiftRow[] | null) ?? []).map(toShift);
}

export async function getShift(id: string): Promise<OnCallShift | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("on_call_shifts").select(SHIFT_SELECT).eq("id", id).maybeSingle();
  return data ? toShift(data as ShiftRow) : null;
}

type LogRow = {
  id: string; company_id: string; branch_id: string | null; ref_number: number; shift_id: string | null;
  occurred_at: string; shift_date: string | null; slot: "am" | "pm" | null;
  handler_profile_id: string | null; handler_name: string | null;
  caller_name: string | null; caller_relationship: string | null; service_user_id: string | null;
  category: string | null; details: string; action_taken: string | null; outcome: string | null;
  complaints_count: number; complaints_logged: boolean; absences_count: number; absences_logged: boolean;
  follow_up_required: boolean; follow_up_notes: string | null; follow_up_done: boolean;
  branches: { name: string } | { name: string }[] | null;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  service_users: { full_name: string } | { full_name: string }[] | null;
};

function toLog(r: LogRow): OnCallLog {
  const branch = relOne(r.branches);
  const prof = relOne(r.profiles);
  const su = relOne(r.service_users);
  const handlerName = (prof ? prof.full_name || prof.email : null) || r.handler_name || null;
  return {
    id: r.id, company_id: r.company_id, branch_id: r.branch_id, branch_name: branch?.name ?? null,
    ref_number: r.ref_number, shift_id: r.shift_id,
    occurred_at: r.occurred_at, shift_date: r.shift_date, slot: r.slot,
    handler_profile_id: r.handler_profile_id, handler_person_name: handlerName, handler_name: r.handler_name,
    caller_name: r.caller_name, caller_relationship: r.caller_relationship,
    service_user_id: r.service_user_id, service_user_name: su?.full_name ?? null,
    category: r.category, details: r.details, action_taken: r.action_taken, outcome: r.outcome,
    complaints_count: r.complaints_count, complaints_logged: r.complaints_logged,
    absences_count: r.absences_count, absences_logged: r.absences_logged,
    follow_up_required: r.follow_up_required, follow_up_notes: r.follow_up_notes, follow_up_done: r.follow_up_done,
  };
}

const LOG_SELECT =
  "id, company_id, branch_id, ref_number, shift_id, occurred_at, shift_date, slot, handler_profile_id, handler_name, caller_name, caller_relationship, service_user_id, category, details, action_taken, outcome, complaints_count, complaints_logged, absences_count, absences_logged, follow_up_required, follow_up_notes, follow_up_done, branches(name), profiles:handler_profile_id(full_name, email), service_users:service_user_id(full_name)";

/** The call log, newest call first. RLS scopes rows to the caller. */
export async function listCallLog(companyId: string): Promise<OnCallLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("on_call_logs")
    .select(LOG_SELECT)
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .order("ref_number", { ascending: false });
  return ((data as LogRow[] | null) ?? []).map(toLog);
}

export async function getLog(id: string): Promise<OnCallLog | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("on_call_logs").select(LOG_SELECT).eq("id", id).maybeSingle();
  return data ? toLog(data as LogRow) : null;
}

/** The caller's in-progress "Log a call" draft, if saved within the last 12 hours.
 *  Restored when they reopen the form; cleared on submit. */
export async function getLogDraft(userId: string): Promise<Record<string, string> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("on_call_log_drafts")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const ageMs = Date.now() - new Date(data.updated_at as string).getTime();
  if (ageMs > 12 * 3600 * 1000) return null;
  return (data.data as Record<string, string> | null) ?? null;
}

/** Who has read a shift's log (first-read time), newest first. */
export async function getLogReads(logId: string): Promise<Array<{ name: string; read_at: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("on_call_log_reads")
    .select("reader_name, read_at")
    .eq("log_id", logId)
    .order("read_at", { ascending: false });
  return ((data as Array<{ reader_name: string | null; read_at: string }> | null) ?? []).map((r) => ({
    name: r.reader_name || "Someone",
    read_at: r.read_at,
  }));
}

export type UrgentFollowUp = {
  id: string;
  shift_date: string | null;
  slot: "am" | "pm" | null;
  branch_name: string | null;
};

/** Open urgent follow-ups for the manager+ dashboard card: shift + date, each
 *  linking to its log. RLS scopes to the caller. */
export async function getUrgentFollowUps(companyId: string): Promise<UrgentFollowUp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("on_call_logs")
    .select("id, shift_date, slot, branches(name)")
    .eq("company_id", companyId)
    .eq("follow_up_required", true)
    .eq("follow_up_done", false)
    .order("shift_date", { ascending: false });
  return ((data as Array<{ id: string; shift_date: string | null; slot: "am" | "pm" | null; branches: { name: string } | { name: string }[] | null }> | null) ?? []).map((r) => ({
    id: r.id,
    shift_date: r.shift_date,
    slot: r.slot,
    branch_name: relOne(r.branches)?.name ?? null,
  }));
}

/** Count of open follow-ups (required, not done) for the header / dashboard. */
export async function getOpenFollowUpCount(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("on_call_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("follow_up_required", true)
    .eq("follow_up_done", false);
  return count ?? 0;
}
