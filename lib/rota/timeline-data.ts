import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hhmm } from "@/lib/rota/types";

/**
 * Be Care Compliant: what the timeline views read beyond the day's visits (Rota and Visits Stage
 * 5b). Read as the signed in office person, so RLS keeps them to their own branches.
 */

export type DayShift = {
  id: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  status: string;
  location: string | null;
  people: { personId: string; name: string }[];
};

/** One branch's shifts on one day, with who is on each (Stage 1 shifts, shown on Carer day). */
export async function getDayShifts(branchId: string, dateIso: string): Promise<DayShift[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_shifts")
    .select("id, start_time, end_time, starts_at, ends_at, status, location, rota_assignments(person_id, status, people(full_name))")
    .eq("branch_id", branchId)
    .eq("shift_date", dateIso)
    .neq("status", "cancelled")
    .order("start_time");
  type R = {
    id: string; start_time: string; end_time: string; starts_at: string; ends_at: string; status: string; location: string | null;
    rota_assignments: { person_id: string; status: string; people: { full_name: string | null } | null }[];
  };
  return ((data as unknown as R[] | null) ?? []).map((s) => ({
    id: s.id,
    startTime: hhmm(s.start_time),
    endTime: hhmm(s.end_time),
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    status: s.status,
    location: s.location,
    people: s.rota_assignments.filter((a) => a.status === "active").map((a) => ({ personId: a.person_id, name: a.people?.full_name ?? "Someone" })),
  }));
}

export type WeekVisit = {
  id: string;
  visitDate: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  status: string;
  service: string | null;
  timeChangedFrom: string | null;
  carers: { personId: string; name: string }[];
  clocks: { personId: string; kind: "in" | "out"; at: string }[];
};

/** One service user's visits across a week, with carers and clock ins (the rota week view). */
export async function getSuWeekVisits(serviceUserId: string, fromIso: string, toIso: string): Promise<WeekVisit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_visits")
    .select("id, visit_date, start_time, end_time, starts_at, status, service, time_changed_from_start, rota_visit_assignments(person_id, status, people(full_name))")
    .eq("service_user_id", serviceUserId)
    .gte("visit_date", fromIso)
    .lte("visit_date", toIso)
    .neq("status", "cancelled")
    .order("visit_date")
    .order("start_time");
  type R = {
    id: string; visit_date: string; start_time: string; end_time: string; starts_at: string; status: string; service: string | null;
    time_changed_from_start: string | null;
    rota_visit_assignments: { person_id: string; status: string; people: { full_name: string | null } | null }[];
  };
  const rows = (data as unknown as R[] | null) ?? [];
  const ids = rows.map((r) => r.id);
  const { data: clocks } = ids.length
    ? await supabase.from("rota_clock_events").select("visit_id, person_id, kind, happened_at").in("visit_id", ids).order("happened_at")
    : { data: [] };
  type C = { visit_id: string; person_id: string; kind: "in" | "out"; happened_at: string };
  return rows.map((r) => ({
    id: r.id,
    visitDate: r.visit_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    startsAt: r.starts_at,
    status: r.status,
    service: r.service,
    timeChangedFrom: r.time_changed_from_start ? hhmm(r.time_changed_from_start) : null,
    carers: r.rota_visit_assignments.filter((a) => a.status === "active").map((a) => ({ personId: a.person_id, name: a.people?.full_name ?? "Someone" })),
    clocks: ((clocks as C[] | null) ?? []).filter((c) => c.visit_id === r.id).map((c) => ({ personId: c.person_id, kind: c.kind, at: c.happened_at })),
  }));
}
