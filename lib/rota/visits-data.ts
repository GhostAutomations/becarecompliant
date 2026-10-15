import "server-only";
import { createClient } from "@/lib/supabase/server";
import { callSlots, type ScheduleEntry } from "@/lib/rota/calls";
import { compareCandidates, milesBetween, normalisePostcode } from "@/lib/rota/geo";
import { postcodePoints } from "@/lib/rota/postcodes";
import { mandatoryTrainingRed, shiftsAround } from "@/lib/rota/data";
import { workingTimeWarnings } from "@/lib/rota/working-time";
import { hhmm, type CallServiceUser, type RotaVisit, type RotaWarning, type VisitCandidate } from "@/lib/rota/types";

/**
 * Be Care Compliant: what the visit screens read (Rota and Visits Stage 2, 2026-10-15). Under the
 * caller's RLS: office roles in their own branches, module on. Only rota pages call these.
 */

const AWAY = new Set(["hospital", "respite"]);

function isAway(status: string | null, since: string | null, dateIso: string): boolean {
  return !!status && AWAY.has(status) && (!since || since <= dateIso);
}

/** Service users of a branch with their current Care Schedule calls, start times and preferences. */
export async function getCallServiceUsers(branchId: string): Promise<CallServiceUser[]> {
  const supabase = await createClient();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const { data: sus } = await supabase
    .from("service_users")
    .select("id, full_name, address, service_status, hospital_since")
    .eq("branch_id", branchId)
    .is("archived_at", null)
    .neq("service_status", "cancelled")
    .order("surname_key");
  type SU = { id: string; full_name: string; address: { postcode?: string } | null; service_status: string | null; hospital_since: string | null };
  const list = (sus as SU[] | null) ?? [];
  if (list.length === 0) return [];
  const ids = list.map((s) => s.id);
  const [{ data: entries }, { data: times }, { data: prefs }] = await Promise.all([
    supabase
      .from("care_plan_entries")
      .select("id, service_user_id, day_of_week, service, unit, quantity, slot, position, carers, effective_from, effective_to")
      .in("service_user_id", ids)
      .is("effective_to", null),
    supabase.from("rota_call_times").select("service_user_id, day_of_week, service, slot_key, occurrence, start_time, length_minutes").in("service_user_id", ids),
    supabase.from("rota_su_carer_prefs").select("service_user_id, person_id, kind, people(full_name)").in("service_user_id", ids),
  ]);
  type T = { service_user_id: string; day_of_week: number; service: string; slot_key: string; occurrence: number; start_time: string; length_minutes: number | null };
  type P = { service_user_id: string; person_id: string; kind: string; people: { full_name: string | null } | null };
  const timeMap = new Map(((times as T[] | null) ?? []).map((t) => [`${t.service_user_id}|${t.day_of_week}|${t.service}|${t.slot_key}|${t.occurrence}`, t]));
  return list.map((su) => {
    const mine = ((entries as (ScheduleEntry & { service_user_id: string })[] | null) ?? []).filter((e) => e.service_user_id === su.id);
    const calls = callSlots(mine).map((c) => {
      const t = timeMap.get(`${su.id}|${c.dayOfWeek}|${c.service}|${c.slotKey}|${c.occurrence}`);
      return { ...c, startTime: t ? hhmm(t.start_time) : null, lengthMinutes: t?.length_minutes ?? null };
    });
    const myPrefs = ((prefs as unknown as P[] | null) ?? []).filter((p) => p.service_user_id === su.id);
    return {
      id: su.id,
      name: su.full_name,
      postcode: normalisePostcode(su.address?.postcode ?? null),
      away: isAway(su.service_status, su.hospital_since, todayIso),
      calls,
      preferred: myPrefs.filter((p) => p.kind === "preferred").map((p) => ({ personId: p.person_id, name: p.people?.full_name ?? "Someone" })),
      notToSend: myPrefs.filter((p) => p.kind === "not_to_send").map((p) => ({ personId: p.person_id, name: p.people?.full_name ?? "Someone" })),
    };
  });
}

/** One branch's visits on one day, with carers on each. */
export async function getDayVisits(branchId: string, dateIso: string): Promise<RotaVisit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rota_visits")
    .select("id, branch_id, service_user_id, visit_date, start_time, end_time, starts_at, ends_at, service, carers_needed, status, schedule_changed, service_users(full_name, address, service_status, hospital_since)")
    .eq("branch_id", branchId)
    .eq("visit_date", dateIso)
    .neq("status", "cancelled")
    .order("starts_at");
  if (error) throw new Error(`The visits could not be read: ${error.message}`);
  type V = {
    id: string; branch_id: string; service_user_id: string; visit_date: string; start_time: string; end_time: string;
    starts_at: string; ends_at: string; service: string | null; carers_needed: number; status: RotaVisit["status"]; schedule_changed: boolean;
    service_users: { full_name: string | null; address: { postcode?: string } | null; service_status: string | null; hospital_since: string | null } | null;
  };
  const rows = (data as unknown as V[] | null) ?? [];
  if (rows.length === 0) return [];
  const { data: assigns } = await supabase
    .from("rota_visit_assignments")
    .select("id, visit_id, person_id, via, warnings, people(full_name)")
    .in("visit_id", rows.map((r) => r.id))
    .eq("status", "active")
    .order("assigned_at");
  type A = { id: string; visit_id: string; person_id: string; via: string; warnings: RotaWarning[] | null; people: { full_name: string | null } | null };
  const byVisit = new Map<string, RotaVisit["assignments"]>();
  for (const a of (assigns as unknown as A[] | null) ?? []) {
    const list = byVisit.get(a.visit_id) ?? [];
    list.push({ id: a.id, personId: a.person_id, name: a.people?.full_name ?? "Someone from another branch", via: a.via, warnings: Array.isArray(a.warnings) ? a.warnings : [] });
    byVisit.set(a.visit_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    serviceUserId: r.service_user_id,
    serviceUserName: r.service_users?.full_name ?? "A service user",
    postcode: normalisePostcode(r.service_users?.address?.postcode ?? null),
    visitDate: r.visit_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    service: r.service,
    carersNeeded: r.carers_needed,
    status: r.status,
    paused: isAway(r.service_users?.service_status ?? null, r.service_users?.hospital_since ?? null, r.visit_date),
    scheduleChanged: r.schedule_changed,
    assignments: byVisit.get(r.id) ?? [],
  }));
}

/** Draft shifts in a branch between two dates (with countDraftVisits, the week's Publish count). */
export async function countDraftShifts(branchId: string, fromIso: string, toIso: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("rota_shifts")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .eq("status", "draft")
    .gte("shift_date", fromIso)
    .lte("shift_date", toIso);
  return count ?? 0;
}

/** Draft visits in a branch between two dates (for the week's Publish count). */
export async function countDraftVisits(branchId: string, fromIso: string, toIso: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("rota_visits")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .eq("status", "draft")
    .gte("visit_date", fromIso)
    .lte("visit_date", toIso);
  return count ?? 0;
}

/** The warnings one person would go on this visit with. */
export async function visitWarningsFor(companyId: string, visitId: string, personId: string, dbs?: string): Promise<RotaWarning[]> {
  const supabase = await createClient();
  const [{ data: visit }, training, { data: setting }] = await Promise.all([
    supabase.from("rota_visits").select("id, visit_date, starts_at, ends_at").eq("id", visitId).maybeSingle(),
    mandatoryTrainingRed(companyId),
    supabase.from("rota_person_settings").select("opted_out_48h").eq("person_id", personId).maybeSingle(),
  ]);
  const v = visit as { id: string; visit_date: string; starts_at: string; ends_at: string } | null;
  if (!v) return [];
  const around = await shiftsAround(companyId, [personId], v.visit_date);
  const out: RotaWarning[] = [];
  const red = training.get(personId) ?? 0;
  if (red > 0) out.push({ kind: "training", text: `Mandatory training out of date (${red} course${red === 1 ? "" : "s"}).` });
  if (dbs === "risk_ok") out.push({ kind: "dbs_pending", text: "No DBS yet: working under a DBS Pending Risk Assessment, double up only." });
  out.push(...workingTimeWarnings(around.get(personId) ?? [], { id: v.id, shiftDate: v.visit_date, startsAt: v.starts_at, endsAt: v.ends_at, breakMinutes: 0 },
    { optedOut48: (setting as { opted_out_48h: boolean } | null)?.opted_out_48h ?? false }));
  return out;
}

/** The recommendation for a visit: everyone in the caller's branches, ranked best first. */
export async function getVisitCandidates(companyId: string, visitId: string, movingAssignmentId?: string): Promise<VisitCandidate[]> {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: visit }, { data: branches }] = await Promise.all([
    // Moving a carer: the list is judged as if their place were free, and leaves them off it.
    movingAssignmentId
      ? supabase.rpc("rota_visit_candidates", { p_visit: visitId, p_moving: movingAssignmentId })
      : supabase.rpc("rota_visit_candidates", { p_visit: visitId }),
    supabase.from("rota_visits").select("id, visit_date, starts_at, ends_at, service_users(address)").eq("id", visitId).maybeSingle(),
    supabase.from("branches").select("id, name").eq("company_id", companyId),
  ]);
  if (error) throw new Error(error.message);
  type C = { person_id: string; full_name: string | null; job_title: string | null; branch_id: string; dbs: string; refusal: string | null; home_postcode: string | null; preferred: boolean; continuity: number };
  const list = (rows as C[] | null) ?? [];
  const v = visit as unknown as { id: string; visit_date: string; starts_at: string; ends_at: string; service_users: { address: { postcode?: string } | null } | null } | null;
  if (!v) return [];
  const suPostcode = normalisePostcode(v.service_users?.address?.postcode ?? null);
  const allowed = list.filter((c) => !c.refusal).map((c) => c.person_id);
  const [points, training, around, { data: settings }] = await Promise.all([
    postcodePoints([suPostcode, ...list.map((c) => c.home_postcode)]),
    mandatoryTrainingRed(companyId),
    shiftsAround(companyId, allowed, v.visit_date),
    supabase.from("rota_person_settings").select("person_id, opted_out_48h").in("person_id", allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const optedOut = new Set(((settings as { person_id: string; opted_out_48h: boolean }[] | null) ?? []).filter((r) => r.opted_out_48h).map((r) => r.person_id));
  const branchName = new Map(((branches as { id: string; name: string }[] | null) ?? []).map((b) => [b.id, b.name]));
  const home = suPostcode ? points.get(suPostcode) : undefined;
  const candidates: VisitCandidate[] = list.map((c) => {
    const warnings: RotaWarning[] = [];
    if (!c.refusal) {
      const red = training.get(c.person_id) ?? 0;
      if (red > 0) warnings.push({ kind: "training", text: `Mandatory training out of date (${red} course${red === 1 ? "" : "s"}).` });
      if (c.dbs === "risk_ok") warnings.push({ kind: "dbs_pending", text: "No DBS yet: working under a DBS Pending Risk Assessment, double up only." });
      warnings.push(...workingTimeWarnings(around.get(c.person_id) ?? [], { id: v.id, shiftDate: v.visit_date, startsAt: v.starts_at, endsAt: v.ends_at, breakMinutes: 0 }, { optedOut48: optedOut.has(c.person_id) }));
    }
    const pc = normalisePostcode(c.home_postcode);
    const p = pc ? points.get(pc) : undefined;
    return {
      personId: c.person_id,
      name: c.full_name ?? "Unnamed",
      jobTitle: c.job_title,
      branchName: branchName.get(c.branch_id) ?? "",
      dbs: c.dbs,
      refusal: c.refusal,
      warnings,
      miles: home && p ? milesBetween(home, p) : null,
      preferred: c.preferred,
      continuity: c.continuity,
    };
  });
  return candidates.sort((a, b) => compareCandidates({ ...a, warnings: a.warnings.length }, { ...b, warnings: b.warnings.length }));
}

/** Active people in the given branches, for the carer pickers (name order). */
export async function getRotaPeople(branchIds: string[]): Promise<{ id: string; name: string }[]> {
  if (branchIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name")
    .in("branch_id", branchIds)
    .is("archived_at", null)
    .neq("employment_status", "leaver")
    .order("surname_key");
  return ((data as { id: string; full_name: string }[] | null) ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}
