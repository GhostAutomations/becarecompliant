import "server-only";
import { createClient } from "@/lib/supabase/server";
import { profilesById, listStaff } from "@/lib/auth/company-profiles";
import { branchScopedRole } from "@/lib/auth/manage-scope";
import { callerBranchIds } from "@/lib/auth/branches";

/** Supabase types a to-one embedded relation as an array; normalise to one row. */
function relOne<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function daysBetweenIso(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export type BoardToBook = {
  instanceId: string;
  subjectId: string;
  population: "people" | "service_users";
  recordName: string;
  checkName: string;
  dueDate: string;
  branchId: string | null;
  block: number; // 0..3 (which 7-day block of the next 28 days)
};
export type BoardBooked = {
  bookingId: string;
  population: "people" | "service_users";
  recordName: string;
  checkName: string;
  date: string; // scheduled date ISO
  startTime: string | null;
  durationMinutes: number | null;
  conductorName: string | null;
  branchId: string | null;
};
export type WhiteboardBoard = {
  toBook: BoardToBook[];
  booked: BoardBooked[];
  peopleHeadings: string[];
  suHeadings: string[];
};

/**
 * The Whiteboard board view. Above the board: checks due in the next 28 days that
 * are not yet booked, in four 7-day blocks. On the board: planned bookings grouped
 * by population and by their check heading. Headings are the company's active check
 * definitions (plus any heading a booking already uses). RLS scopes every read.
 */
export async function getWhiteboardBoard(companyId: string, todayIso: string): Promise<WhiteboardBoard> {
  const supabase = await createClient();
  const horizon = addDaysIso(todayIso, 28);

  const [defsRes, bookedRows, instRes] = await Promise.all([
    supabase
      .from("check_definitions")
      .select("name, population, active, sort_order")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("planner_bookings")
      .select(SELECT)
      .eq("status", "planned"),
    supabase
      .from("check_instances")
      .select(
        "id, record_type, person_id, service_user_id, due_date, branch_id, active, check_definitions(name), people(full_name, employment_status, archived_at), service_users(full_name, service_status, archived_at)",
      )
      .eq("company_id", companyId)
      .eq("active", true)
      .not("due_date", "is", null)
      .gte("due_date", todayIso)
      .lte("due_date", horizon),
  ]);

  const peopleHeadings: string[] = [];
  const suHeadings: string[] = [];
  for (const d of defsRes.data ?? []) {
    if (d.population === "people") peopleHeadings.push(d.name as string);
    else if (d.population === "service_users") suHeadings.push(d.name as string);
  }

  // Booked (planned) bookings, and the set of booked check instances so the
  // to-book list can exclude anything already booked.
  const booked: BoardBooked[] = [];
  const bookedInstanceIds = new Set<string>();
  /*
   * The board is the DEFAULT Whiteboard view and the calendar is opt in, so filling the names in
   * listBoardBookings and not here fixed the view nobody lands on. To a Manager or a Supervisor
   * every chip on the board simply dropped the name of whoever is carrying the booking out.
   */
  const bookedViews = await withConductorNames(
    ((bookedRows.data as Row[] | null) ?? []).filter(checkStillBookable).map(toView),
    companyId,
  );
  for (const v of bookedViews) {
    if (v.checkInstanceId) bookedInstanceIds.add(v.checkInstanceId);
    booked.push({
      bookingId: v.id,
      population: (v.population ?? "people") as "people" | "service_users",
      recordName: v.subjectName ?? "—",
      checkName: v.label,
      date: v.scheduledDate,
      startTime: v.startTime,
      durationMinutes: v.durationMinutes,
      conductorName: v.conductorName,
      branchId: v.branchId,
    });
    if (v.population === "people" && !peopleHeadings.includes(v.label)) peopleHeadings.push(v.label);
    if (v.population === "service_users" && !suHeadings.includes(v.label)) suHeadings.push(v.label);
  }

  const toBook: BoardToBook[] = [];
  for (const raw of instRes.data ?? []) {
    if (bookedInstanceIds.has(raw.id as string)) continue;
    const def = relOne((raw as { check_definitions: { name: string }[] | { name: string } | null }).check_definitions);
    if (!def) continue;
    const dueDate = raw.due_date as string;
    if (raw.record_type === "person") {
      const p = relOne((raw as { people: { full_name: string; employment_status: string; archived_at: string | null }[] | { full_name: string; employment_status: string; archived_at: string | null } | null }).people);
      if (!p || p.employment_status !== "active" || p.archived_at) continue;
      toBook.push({
        instanceId: raw.id as string,
        subjectId: raw.person_id as string,
        population: "people",
        recordName: p.full_name,
        checkName: def.name,
        dueDate,
        branchId: (raw.branch_id as string | null) ?? null,
        block: Math.min(3, Math.max(0, Math.floor(daysBetweenIso(todayIso, dueDate) / 7))),
      });
    } else if (raw.record_type === "service_user") {
      const su = relOne((raw as { service_users: { full_name: string; service_status: string; archived_at: string | null }[] | { full_name: string; service_status: string; archived_at: string | null } | null }).service_users);
      if (!su || su.service_status !== "active" || su.archived_at) continue;
      toBook.push({
        instanceId: raw.id as string,
        subjectId: raw.service_user_id as string,
        population: "service_users",
        recordName: su.full_name,
        checkName: def.name,
        dueDate,
        branchId: (raw.branch_id as string | null) ?? null,
        block: Math.min(3, Math.max(0, Math.floor(daysBetweenIso(todayIso, dueDate) / 7))),
      });
    }
  }

  toBook.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  booked.sort((a, b) => a.date.localeCompare(b.date));
  return { toBook, booked, peopleHeadings, suHeadings };
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
  // The check this booking is against (null for ad-hoc/title-only bookings), carried
  // only so we can hide bookings whose check DEFINITION has since been turned off.
  linked_check: { definition: { active: boolean }[] | { active: boolean } | null }[] | { definition: { active: boolean }[] | { active: boolean } | null } | null;
};

/** Who may be given a task to carry out. Passed to list_company_staff, and mirrored by
 *  is_company_conductor in migration 0192, which is what actually enforces it. */
const CONDUCTOR_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor"];

const SELECT =
  "id, branch_id, population, subject_person_id, subject_service_user_id, check_instance_id, check_kind, title, conductor_profile_id, scheduled_date, start_time, duration_minutes, status, notes, conductor:profiles(full_name), person:people(full_name), service_user:service_users(full_name), branch:branches(name), linked_check:check_instances(definition:check_definitions(active))";

/**
 * Fill in the conductor names the embedded join could not read.
 *
 * WHY (Phil, 2026-08-16: "there are chips on the calendar as unassigned"). There were not. Every
 * booking has a conductor — the column is NOT NULL and no row is without one. The NAME was
 * missing, because SELECT reads it through `conductor:profiles(full_name)` and profiles_select
 * hands a Manager or a Supervisor only their own row. So a whiteboard full of colleagues' work
 * showed a whiteboard full of nobody's work.
 *
 * company_profiles_by_id is SECURITY DEFINER and answers only about ids the caller already
 * holds, inside their own company, including people who have since left, because a booking made
 * last month still has to say who it was for.
 *
 * The join is LEFT IN PLACE and tried first: for an Admin, and for your own bookings, it already
 * works and this costs nothing.
 */
async function withConductorNames(
  rows: PlannerBookingView[],
  companyId?: string,
): Promise<PlannerBookingView[]> {
  const missing = [...new Set(rows.filter((r) => !r.conductorName).map((r) => r.conductorId))];
  if (missing.length === 0) return rows;
  const byId = await profilesById(missing, companyId);
  return rows.map((r) => (r.conductorName ? r : { ...r, conductorName: byId.get(r.conductorId)?.name ?? null }));
}

/** A booking is shown only if it is ad-hoc (no linked check) or its check definition
 *  is still active. Hides ghost bookings left behind when a check is turned off (e.g.
 *  Annual Appraisal under the four-supervisions cycle). */
function checkStillBookable(r: Row): boolean {
  const inst = relOne(r.linked_check);
  if (!inst) return true;
  const def = relOne(inst.definition);
  return !def || def.active !== false;
}

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

/**
 * The roles that have a planner. One source of truth: the Planner page guards on this, and the
 * dashboard Planner tile shows nothing to anyone outside it, so the two can never disagree about
 * who has a planner.
 */
export const PLANNER_ROLES = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

/** Bookings the given user conducts (their personal planner). */
export async function listMyBookings(userId: string): Promise<PlannerBookingView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_bookings")
    .select(SELECT)
    .eq("conductor_profile_id", userId)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });
  return withConductorNames(((data as Row[] | null) ?? []).filter(checkStillBookable).map(toView));
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
  return withConductorNames(((data as Row[] | null) ?? []).filter(checkStillBookable).map(toView));
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
  return withConductorNames(((data as Row[] | null) ?? []).filter(checkStillBookable).map(toView));
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
  /** The branches this viewer RUNS. Empty for a company wide role, which may conduct anywhere.
   *  Used only to decide whether they may put THEMSELVES down as the conductor. */
  myBranchIds: string[];
  viewerId: string;
  viewerRole: string;
  branches: Array<{ id: string; name: string }>;
  conductors: Array<{ id: string; name: string }>;
  subjects: PlannerSubject[];
};


/** Lighter form data for a record page: branches, conductors and a single preset
 *  subject (the record) with its bookable checks. Avoids loading every subject. */
export async function getPlannerRecordForm(
  companyId: string,
  population: "people" | "service_users",
  recordId: string,
  recordName: string,
  branchId: string | null,
  viewer: { id: string; role: string },
): Promise<{ data: PlannerFormData; preset: PlannerSubject }> {
  const supabase = await createClient();
  // Same as getPlannerFormData: the form needs to know which branches this viewer runs, so it can
  // decide whether they may put themselves down as the conductor. See migration 0191.
  const myBranchIds = branchScopedRole(viewer.role) ? await callerBranchIds(viewer.id) : [];
  const instColumn = population === "people" ? "person_id" : "service_user_id";
  const recordType = population === "people" ? "person" : "service_user";
  const [branchesRes, conductorsRes, instRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind")
      .eq("company_id", companyId)
      .in("kind", ["branch", "team"])
      .order("name", { ascending: true }),
    /*
     * THROUGH THE RPC, not the table. profiles_select hands a Manager or a Supervisor ONLY THEIR
     * OWN ROW, so reading the table here returned a conductor list of one: themselves. On a carer
     * outside their branches the form then removed even that, leaving an empty required dropdown
     * under a note offering to book it for a colleague. list_company_staff is SECURITY
     * DEFINER and is given the conductor role list here; see migration 0199. It takes the company as an
     * argument because the founder managing as a company has no company_id of his own, and the
     * database sees his auth.uid() rather than the shadowed profile.
     */
    listStaff({ companyId, roles: CONDUCTOR_ROLES }),
    supabase
      .from("check_instances")
      // !inner + the definition active filter so a check whose DEFINITION was turned
      // off (e.g. Annual Appraisal under the four-supervisions cycle) is not bookable,
      // even though its instance row is still active.
      .select("id, due_date, check_definitions!inner(name, key, active)")
      .eq("company_id", companyId)
      .eq("record_type", recordType)
      .eq(instColumn, recordId)
      .eq("active", true)
      .eq("check_definitions.active", true),
  ]);

  const branches = (branchesRes.data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
  const conductors = conductorsRes.map((p) => ({ id: p.id, name: p.name }));
  const checks: BookableCheck[] = [];
  for (const raw of instRes.data ?? []) {
    const def = relOne((raw as { check_definitions: { name: string; key: string }[] | { name: string; key: string } | null }).check_definitions);
    if (!def) continue;
    checks.push({ instanceId: raw.id as string, name: def.name, key: def.key, dueDate: (raw.due_date as string | null) ?? null });
  }
  checks.sort((a, b) => a.name.localeCompare(b.name));

  const preset: PlannerSubject = { population, id: recordId, name: recordName, branchId, checks };
  return {
    data: { branches, conductors, subjects: [], myBranchIds, viewerId: viewer.id, viewerRole: viewer.role },
    preset,
  };
}

/**
 * What Book a task may offer.
 *
 * EVERYONE IN THE COMPANY, and a list of the branches this viewer runs (Phil, 2026-08-15:
 * "people may book tasks for each other").
 *
 * It briefly narrowed to the viewer's own branches, which was too tight: a manager arranges a
 * supervision and asks a colleague in another branch to carry it out. The restriction that
 * matters is narrower than a branch and lives on the CONDUCTOR, not the subject:
 *
 *   book anyone; do not book YOURSELF outside the branches you run.
 *
 * Being the conductor of a live booking is what grants sight of that carer's record (0183), so
 * the thing to prevent is granting that to yourself. `myBranchIds` is handed to the form so the
 * conductor list can drop "me" for a carer outside them, matching migration 0191 exactly.
 */
export async function getPlannerFormData(
  companyId: string,
  viewer: { id: string; role: string },
): Promise<PlannerFormData> {
  const supabase = await createClient();
  /** Empty for a company wide role, which may conduct anywhere and never consults this. */
  const myBranchIds = branchScopedRole(viewer.role) ? await callerBranchIds(viewer.id) : [];

  const [branchesRes, conductorsRes, peopleRes, suRes, instRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind")
      .eq("company_id", companyId)
      .in("kind", ["branch", "team"])
      .order("name", { ascending: true }),
    /*
     * THROUGH THE RPC, not the table. profiles_select hands a Manager or a Supervisor ONLY THEIR
     * OWN ROW, so reading the table here returned a conductor list of one: themselves. On a carer
     * outside their branches the form then removed even that, leaving an empty required dropdown
     * under a note offering to book it for a colleague. list_company_staff is SECURITY
     * DEFINER and is given the conductor role list here; see migration 0199. It takes the company as an
     * argument because the founder managing as a company has no company_id of his own, and the
     * database sees his auth.uid() rather than the shadowed profile.
     */
    listStaff({ companyId, roles: CONDUCTOR_ROLES }),
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
      // !inner + definition active filter: exclude checks whose definition is turned off.
      .select("id, record_type, person_id, service_user_id, due_date, active, check_definitions!inner(name, key, active)")
      .eq("company_id", companyId)
      .eq("active", true)
      .eq("check_definitions.active", true),
  ]);

  const branches = (branchesRes.data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
  const conductors = conductorsRes.map((p) => ({ id: p.id, name: p.name }));

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

  return { branches, conductors, subjects, myBranchIds, viewerId: viewer.id, viewerRole: viewer.role };
}
