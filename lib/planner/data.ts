import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Supabase types a to-one embedded relation as an array; normalise to one row. */
function relOne<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Planner data layer. All reads go through the user's RLS-scoped client, so branch
 * and role visibility (Branch Manager / Supervisor see their branch, company-wide
 * roles + Admins see all, conductor always sees their own) is enforced by the
 * database, not here.
 */

export type BookingStatus = "planned" | "completed" | "cancelled";

export type PlannerBookingView = {
  id: string;
  branchId: string;
  branchName: string | null;
  population: "people" | "service_users" | null;
  subjectId: string | null;
  subjectName: string | null;
  checkInstanceId: string | null;
  /** The label to show: ad-hoc title, or the check name it was booked against. */
  label: string;
  conductorId: string;
  conductorName: string | null;
  scheduledDate: string; // ISO date
  startTime: string | null; // HH:MM
  durationMinutes: number | null;
  status: BookingStatus;
  notes: string | null;
};

type Row = {
  id: string;
  branch_id: string;
  population: "people" | "service_users" | null;
  subject_person_id: string | null;
  subject_service_user_id: string | null;
  check_instance_id: string | null;
  check_kind: string | null;
  title: string | null;
  conductor_profile_id: string;
  scheduled_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  status: BookingStatus;
  notes: string | null;
  conductor: { full_name: string | null } | null;
  person: { full_name: string | null } | null;
  service_user: { full_name: string | null } | null;
  branch: { name: string | null } | null;
};

const SELECT =
  "id, branch_id, population, subject_person_id, subject_service_user_id, check_instance_id, check_kind, title, conductor_profile_id, scheduled_date, start_time, duration_minutes, status, notes, conductor:profiles(full_name), person:people(full_name), service_user:service_users(full_name), branch:branches(name)";

function toView(r: Row): PlannerBookingView {
  const subjectName = r.person?.full_name ?? r.service_user?.full_name ?? null;
  const label = r.title?.trim() || r.check_kind?.trim() || "Task";
  const startTime = r.start_time ? r.start_time.slice(0, 5) : null;
  return {
    id: r.id,
    branchId: r.branch_id,
    branchName: r.branch?.name ?? null,
    population: r.population,
    subjectId: r.subject_person_id ?? r.subject_service_user_id ?? null,
    subjectName,
    checkInstanceId: r.check_instance_id,
    label,
    conductorId: r.conductor_profile_id,
    conductorName: r.conductor?.full_name ?? null,
    scheduledDate: r.scheduled_date,
    startTime,
    durationMinutes: r.duration_minutes,
    status: r.status,
    notes: r.notes,
  };
}

/** Bookings the given user conducts (their personal planner). */
export async function listMyBookings(userId: string): Promise<PlannerBookingView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_bookings")
    .select(SELECT)
    .eq("conductor_profile_id", userId)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });
  return ((data as Row[] | null) ?? []).map(toView);
}

/** Every booking visible to the caller in a date range (the whiteboard). RLS
 *  scopes the rows to their branch(es). */
export async function listBoardBookings(
  fromIso: string,
  toIso: string,
): Promise<PlannerBookingView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_bookings")
    .select(SELECT)
    .gte("scheduled_date", fromIso)
    .lte("scheduled_date", toIso)
    .neq("status", "cancelled")
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });
  return ((data as Row[] | null) ?? []).map(toView);
}

/** Active, non-cancelled bookings for one record (shown on its record page). */
export async function listRecordBookings(
  recordType: "person" | "service_user",
  recordId: string,
): Promise<PlannerBookingView[]> {
  const supabase = await createClient();
  const column = recordType === "person" ? "subject_person_id" : "subject_service_user_id";
  const { data } = await supabase
    .from("planner_bookings")
    .select(SELECT)
    .eq(column, recordId)
    .eq("status", "planned")
    .order("scheduled_date", { ascending: true });
  return ((data as Row[] | null) ?? []).map(toView);
}

// ---------------------------------------------------------------------------
// Data for the booking form: branches, conductors, and every active subject with
// its bookable (active) checks.
// ---------------------------------------------------------------------------

export type BookableCheck = { instanceId: string; name: string; key: string; dueDate: string | null };
export type PlannerSubject = {
  population: "people" | "service_users";
  id: string;
  name: string;
  branchId: string | null;
  checks: BookableCheck[];
};
export type PlannerFormData = {
  branches: Array<{ id: string; name: string }>;
  conductors: Array<{ id: string; name: string }>;
  subjects: PlannerSubject[];
};

const CONDUCTOR_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

/** Lighter form data for a record page: branches, conductors and a single preset
 *  subject (the record) with its bookable checks. Avoids loading every subject. */
export async function getPlannerRecordForm(
  companyId: string,
  population: "people" | "service_users",
  recordId: string,
  recordName: string,
  branchId: string | null,
): Promise<{ data: PlannerFormData; preset: PlannerSubject }> {
  const supabase = await createClient();
  const instColumn = population === "people" ? "person_id" : "service_user_id";
  const recordType = population === "people" ? "person" : "service_user";
  const [branchesRes, conductorsRes, instRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind")
      .eq("company_id", companyId)
      .in("kind", ["branch", "team"])
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .in("role", CONDUCTOR_ROLES),
    supabase
      .from("check_instances")
      .select("id, due_date, check_definitions(name, key)")
      .eq("company_id", companyId)
      .eq("record_type", recordType)
      .eq(instColumn, recordId)
      .eq("active", true),
  ]);

  const branches = (branchesRes.data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
  const conductors = (conductorsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string),
  }));
  const checks: BookableCheck[] = [];
  for (const raw of instRes.data ?? []) {
    const def = relOne((raw as { check_definitions: { name: string; key: string }[] | { name: string; key: string } | null }).check_definitions);
    if (!def) continue;
    checks.push({ instanceId: raw.id as string, name: def.name, key: def.key, dueDate: (raw.due_date as string | null) ?? null });
  }
  checks.sort((a, b) => a.name.localeCompare(b.name));

  const preset: PlannerSubject = { population, id: recordId, name: recordName, branchId, checks };
  return { data: { branches, conductors, subjects: [] }, preset };
}

export async function getPlannerFormData(companyId: string): Promise<PlannerFormData> {
  const supabase = await createClient();

  const [branchesRes, conductorsRes, peopleRes, suRes, instRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind")
      .eq("company_id", companyId)
      .in("kind", ["branch", "team"])
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .in("role", CONDUCTOR_ROLES),
    supabase
      .from("people")
      .select("id, full_name, branch_id, employment_status, archived_at")
      .eq("company_id", companyId)
      .eq("employment_status", "active")
      .is("archived_at", null),
    supabase
      .from("service_users")
      .select("id, full_name, branch_id, service_status, archived_at")
      .eq("company_id", companyId)
      .eq("service_status", "active")
      .is("archived_at", null),
    supabase
      .from("check_instances")
      .select("id, record_type, person_id, service_user_id, due_date, active, check_definitions(name, key)")
      .eq("company_id", companyId)
      .eq("active", true),
  ]);

  const branches = (branchesRes.data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
  const conductors = (conductorsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string),
  }));

  // Group active check instances by their record.
  const byPerson = new Map<string, BookableCheck[]>();
  const bySu = new Map<string, BookableCheck[]>();
  for (const raw of instRes.data ?? []) {
    const def = relOne((raw as { check_definitions: { name: string; key: string }[] | { name: string; key: string } | null }).check_definitions);
    if (!def) continue;
    const c: BookableCheck = {
      instanceId: raw.id as string,
      name: def.name,
      key: def.key,
      dueDate: (raw.due_date as string | null) ?? null,
    };
    if (raw.record_type === "person" && raw.person_id) {
      const arr = byPerson.get(raw.person_id as string) ?? [];
      arr.push(c);
      byPerson.set(raw.person_id as string, arr);
    } else if (raw.record_type === "service_user" && raw.service_user_id) {
      const arr = bySu.get(raw.service_user_id as string) ?? [];
      arr.push(c);
      bySu.set(raw.service_user_id as string, arr);
    }
  }

  const subjects: PlannerSubject[] = [];
  for (const p of peopleRes.data ?? []) {
    subjects.push({
      population: "people",
      id: p.id as string,
      name: p.full_name as string,
      branchId: (p.branch_id as string | null) ?? null,
      checks: (byPerson.get(p.id as string) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  for (const su of suRes.data ?? []) {
    subjects.push({
      population: "service_users",
      id: su.id as string,
      name: su.full_name as string,
      branchId: (su.branch_id as string | null) ?? null,
      checks: (bySu.get(su.id as string) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name));

  return { branches, conductors, subjects };
}
