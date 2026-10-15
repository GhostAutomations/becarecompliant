import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getTrainingMatrix } from "@/lib/training/data";
import { addDaysIso, mondayOfIso, workingTimeWarnings, type ShiftSpan } from "@/lib/rota/working-time";
import { hhmm, type RotaCandidate, type RotaRequest, type RotaShift, type RotaTemplate, type RotaWarning } from "@/lib/rota/types";

/**
 * Be Care Compliant: what the rota screens read (Rota and Visits Stage 1, 2026-10-15). Every read
 * runs under the caller's own RLS: office roles see their own branches, and only while the module
 * is on. Only rota pages call these, so no existing page does any of this work.
 */

type ShiftRow = {
  id: string; branch_id: string; shift_date: string; start_time: string; end_time: string;
  starts_at: string; ends_at: string; break_minutes: number; headcount: number;
  location: string | null; notes: string | null; status: RotaShift["status"]; template_id: string | null;
};

/** The branches the caller may run the rota for. The Founder (managing a company) gets all of it. */
export async function getRotaBranches(companyId: string, isFounder: boolean): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  let ids: string[] | null = null;
  if (!isFounder) {
    const { data } = await supabase.rpc("rota_office_branch_ids");
    ids = (data as string[] | null) ?? [];
    if (ids.length === 0) return [];
  }
  let q = supabase.from("branches").select("id, name").eq("company_id", companyId).order("name");
  if (ids) q = q.in("id", ids);
  const { data } = await q;
  return (data as { id: string; name: string }[] | null) ?? [];
}

/** One week of one branch: every shift that is not cancelled, with who is on it. */
export async function getRotaWeek(branchId: string, mondayIso: string): Promise<RotaShift[]> {
  const supabase = await createClient();
  const { data: shifts, error } = await supabase
    .from("rota_shifts")
    .select("id, branch_id, shift_date, start_time, end_time, starts_at, ends_at, break_minutes, headcount, location, notes, status, template_id")
    .eq("branch_id", branchId)
    .neq("status", "cancelled")
    .gte("shift_date", mondayIso)
    .lte("shift_date", addDaysIso(mondayIso, 6))
    .order("shift_date")
    .order("start_time");
  if (error) throw new Error(`The rota could not be read: ${error.message}`);
  const rows = (shifts as ShiftRow[] | null) ?? [];
  if (rows.length === 0) return [];
  const { data: assigns } = await supabase
    .from("rota_assignments")
    .select("id, shift_id, person_id, via, warnings, people(full_name)")
    .in("shift_id", rows.map((r) => r.id))
    .eq("status", "active")
    .order("assigned_at");
  type A = { id: string; shift_id: string; person_id: string; via: string; warnings: RotaWarning[] | null; people: { full_name: string | null } | null };
  const byShift = new Map<string, RotaShift["assignments"]>();
  for (const a of (assigns as unknown as A[] | null) ?? []) {
    const list = byShift.get(a.shift_id) ?? [];
    list.push({
      id: a.id,
      personId: a.person_id,
      // A person from a branch the caller cannot see still shows as somebody being there.
      name: a.people?.full_name ?? "Someone from another branch",
      via: a.via,
      warnings: Array.isArray(a.warnings) ? a.warnings : [],
    });
    byShift.set(a.shift_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    shiftDate: r.shift_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    breakMinutes: r.break_minutes,
    headcount: r.headcount,
    location: r.location,
    notes: r.notes,
    status: r.status,
    templateId: r.template_id,
    assignments: byShift.get(r.id) ?? [],
  }));
}

export async function getRotaTemplates(branchId: string, includeInactive = false): Promise<RotaTemplate[]> {
  const supabase = await createClient();
  let q = supabase
    .from("rota_shift_templates")
    .select("id, branch_id, name, start_time, end_time, break_minutes, headcount, location, active")
    .eq("branch_id", branchId)
    .order("start_time");
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  type T = { id: string; branch_id: string; name: string; start_time: string; end_time: string; break_minutes: number; headcount: number; location: string | null; active: boolean };
  return ((data as T[] | null) ?? []).map((t) => ({
    id: t.id, branchId: t.branch_id, name: t.name, startTime: hhmm(t.start_time), endTime: hhmm(t.end_time),
    breakMinutes: t.break_minutes, headcount: t.headcount, location: t.location, active: t.active,
  }));
}

/** Open shift requests waiting for the office, for one branch. */
export async function getPendingRequests(branchId: string): Promise<RotaRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_open_requests")
    .select("id, shift_id, person_id, requested_at, people(full_name), rota_shifts(shift_date, start_time, end_time)")
    .eq("branch_id", branchId)
    .eq("status", "pending")
    .order("requested_at");
  type R = { id: string; shift_id: string; person_id: string; requested_at: string; people: { full_name: string | null } | null; rota_shifts: { shift_date: string; start_time: string; end_time: string } | null };
  return ((data as unknown as R[] | null) ?? []).map((r) => ({
    id: r.id, shiftId: r.shift_id, personId: r.person_id, name: r.people?.full_name ?? "A carer",
    shiftDate: r.rota_shifts?.shift_date ?? "", startTime: hhmm(r.rota_shifts?.start_time), endTime: hhmm(r.rota_shifts?.end_time),
    requestedAt: r.requested_at,
  }));
}

/** People whose mandatory training is red today, with how many courses. One shared matrix read. */
export async function mandatoryTrainingRed(companyId: string): Promise<Map<string, number>> {
  const matrix = await getTrainingMatrix(companyId, null);
  const mandatory = new Set(matrix.courses.filter((c) => c.mandatory).map((c) => c.id));
  const out = new Map<string, number>();
  for (const p of matrix.people) {
    let n = 0;
    for (const [courseId, cell] of Object.entries(p.cells)) if (mandatory.has(courseId) && cell.rag === "red") n += 1;
    if (n > 0) out.set(p.id, n);
  }
  return out;
}

/** The other shifts these people work around a date (17 weeks back, 1 forward), for the warnings. */
async function shiftsAround(companyId: string, personIds: string[], shiftDate: string): Promise<Map<string, ShiftSpan[]>> {
  const out = new Map<string, ShiftSpan[]>();
  if (personIds.length === 0) return out;
  const supabase = await createClient();
  const from = addDaysIso(mondayOfIso(shiftDate), -17 * 7);
  const to = addDaysIso(mondayOfIso(shiftDate), 13);
  const { data } = await supabase
    .from("rota_assignments")
    .select("person_id, rota_shifts!inner(id, shift_date, starts_at, ends_at, break_minutes, status)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("person_id", personIds)
    .gte("rota_shifts.shift_date", from)
    .lte("rota_shifts.shift_date", to)
    .neq("rota_shifts.status", "cancelled");
  type R = { person_id: string; rota_shifts: { id: string; shift_date: string; starts_at: string; ends_at: string; break_minutes: number } };
  for (const r of (data as unknown as R[] | null) ?? []) {
    const list = out.get(r.person_id) ?? [];
    list.push({ id: r.rota_shifts.id, shiftDate: r.rota_shifts.shift_date, startsAt: r.rota_shifts.starts_at, endsAt: r.rota_shifts.ends_at, breakMinutes: r.rota_shifts.break_minutes });
    out.set(r.person_id, list);
  }
  return out;
}

/** Everyone in the caller's branches for this shift: who can go on, who cannot and why, warnings. */
export async function getCandidates(companyId: string, shiftId: string): Promise<RotaCandidate[]> {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: shift }, { data: branches }] = await Promise.all([
    supabase.rpc("rota_candidates", { p_shift: shiftId }),
    supabase.from("rota_shifts").select("id, shift_date, starts_at, ends_at, break_minutes").eq("id", shiftId).maybeSingle(),
    supabase.from("branches").select("id, name").eq("company_id", companyId),
  ]);
  if (error) throw new Error(error.message);
  type C = { person_id: string; full_name: string | null; job_title: string | null; branch_id: string; dbs: string; refusal: string | null };
  const list = (rows as C[] | null) ?? [];
  const s = shift as { id: string; shift_date: string; starts_at: string; ends_at: string; break_minutes: number } | null;
  if (!s) return [];
  const branchName = new Map(((branches as { id: string; name: string }[] | null) ?? []).map((b) => [b.id, b.name]));
  const allowed = list.filter((c) => !c.refusal).map((c) => c.person_id);
  const [training, around, { data: settings }] = await Promise.all([
    mandatoryTrainingRed(companyId),
    shiftsAround(companyId, allowed, s.shift_date),
    supabase.from("rota_person_settings").select("person_id, opted_out_48h").in("person_id", allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const optedOut = new Set(((settings as { person_id: string; opted_out_48h: boolean }[] | null) ?? []).filter((r) => r.opted_out_48h).map((r) => r.person_id));
  const candidate: ShiftSpan = { id: s.id, shiftDate: s.shift_date, startsAt: s.starts_at, endsAt: s.ends_at, breakMinutes: s.break_minutes };
  return list.map((c) => {
    const warnings: RotaWarning[] = [];
    if (!c.refusal) {
      const red = training.get(c.person_id) ?? 0;
      if (red > 0) warnings.push({ kind: "training", text: `Mandatory training out of date (${red} course${red === 1 ? "" : "s"}).` });
      if (c.dbs === "risk_ok") warnings.push({ kind: "dbs_pending", text: "No DBS yet: working under a DBS Pending Risk Assessment, double up only." });
      warnings.push(...workingTimeWarnings(around.get(c.person_id) ?? [], candidate, { optedOut48: optedOut.has(c.person_id) }));
    }
    return {
      personId: c.person_id,
      name: c.full_name ?? "Unnamed",
      jobTitle: c.job_title,
      branchName: branchName.get(c.branch_id) ?? "",
      dbs: c.dbs,
      refusal: c.refusal,
      warnings,
    };
  });
}

/** For the availability screen: people in a branch with their pattern, dates and opt out. */
export async function getAvailability(branchId: string) {
  const supabase = await createClient();
  const [{ data: people }, { data: pattern }, { data: dates }, { data: settings }] = await Promise.all([
    supabase.from("people").select("id, full_name, job_title").eq("branch_id", branchId).is("archived_at", null).neq("employment_status", "leaver").order("surname_key"),
    supabase.from("rota_availability").select("id, person_id, weekday, start_time, end_time").eq("branch_id", branchId).order("weekday").order("start_time"),
    supabase.from("rota_unavailable_dates").select("id, person_id, start_date, end_date, reason").eq("branch_id", branchId).gte("end_date", new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date())).order("start_date"),
    supabase.from("rota_person_settings").select("person_id, opted_out_48h, opted_out_set_at").eq("branch_id", branchId),
  ]);
  type P = { id: string; full_name: string; job_title: string | null };
  type W = { id: string; person_id: string; weekday: number; start_time: string; end_time: string };
  type D = { id: string; person_id: string; start_date: string; end_date: string; reason: string | null };
  type S = { person_id: string; opted_out_48h: boolean; opted_out_set_at: string | null };
  return ((people as P[] | null) ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    jobTitle: p.job_title,
    pattern: ((pattern as W[] | null) ?? []).filter((w) => w.person_id === p.id).map((w) => ({ id: w.id, weekday: w.weekday, start: hhmm(w.start_time), end: hhmm(w.end_time) })),
    dates: ((dates as D[] | null) ?? []).filter((d) => d.person_id === p.id).map((d) => ({ id: d.id, start: d.start_date, end: d.end_date, reason: d.reason })),
    optedOut: ((settings as S[] | null) ?? []).find((s) => s.person_id === p.id)?.opted_out_48h ?? false,
  }));
}

/** The warnings one person would go on this shift with (training, DBS pending, working time). */
export async function warningsFor(companyId: string, shiftId: string, personId: string): Promise<RotaWarning[]> {
  const supabase = await createClient();
  const [{ data: shift }, training, { data: setting }, { data: rows }] = await Promise.all([
    supabase.from("rota_shifts").select("id, shift_date, starts_at, ends_at, break_minutes").eq("id", shiftId).maybeSingle(),
    mandatoryTrainingRed(companyId),
    supabase.from("rota_person_settings").select("opted_out_48h").eq("person_id", personId).maybeSingle(),
    supabase.rpc("rota_candidates", { p_shift: shiftId }),
  ]);
  const s = shift as { id: string; shift_date: string; starts_at: string; ends_at: string; break_minutes: number } | null;
  if (!s) return [];
  const around = await shiftsAround(companyId, [personId], s.shift_date);
  const out: RotaWarning[] = [];
  const red = training.get(personId) ?? 0;
  if (red > 0) out.push({ kind: "training", text: `Mandatory training out of date (${red} course${red === 1 ? "" : "s"}).` });
  const me = ((rows as { person_id: string; dbs: string }[] | null) ?? []).find((r) => r.person_id === personId);
  if (me?.dbs === "risk_ok") out.push({ kind: "dbs_pending", text: "No DBS yet: working under a DBS Pending Risk Assessment, double up only." });
  out.push(
    ...workingTimeWarnings(
      around.get(personId) ?? [],
      { id: s.id, shiftDate: s.shift_date, startsAt: s.starts_at, endsAt: s.ends_at, breakMinutes: s.break_minutes },
      { optedOut48: (setting as { opted_out_48h: boolean } | null)?.opted_out_48h ?? false },
    ),
  );
  return out;
}
