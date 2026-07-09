import "server-only";

/**
 * Be Care Compliant — People (Phase 3) server data access. All reads go through
 * the RLS-scoped user client, so a Manager sees their branch(es), a Supervisor
 * their caseload, a Team Member only their own Record. Active views exclude
 * leavers and archived Records.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  CheckDefinition,
  CheckStatus,
  PersonRecord,
  PersonRollup,
  PersonTracker,
  RegisterRow,
} from "./types";

export type BranchLite = { id: string; name: string; kind: string };
export type ProfileLite = { id: string; full_name: string; email: string; role: string };

/** Record-level RAG counts for the Compliance Summary (optionally per branch). */
export async function getRollupCounts(
  companyId: string,
  branchId?: string | null,
): Promise<{ compliant: number; dueSoon: number; overdue: number; total: number }> {
  const supabase = await createClient();
  let query = supabase.from("person_rollup").select("rag, branch_id").eq("company_id", companyId);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  const counts = { compliant: 0, dueSoon: 0, overdue: 0, total: 0 };
  for (const r of (data as Array<{ rag: string }> | null) ?? []) {
    counts.total += 1;
    if (r.rag === "red") counts.overdue += 1;
    else if (r.rag === "amber") counts.dueSoon += 1;
    else if (r.rag === "green") counts.compliant += 1;
  }
  return counts;
}

/** The company Probationary Period in days (default 180). */
export async function getProbationPeriod(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("probation_period_days")
    .eq("id", companyId)
    .maybeSingle();
  return (data?.probation_period_days as number | null) ?? 180;
}

/** Per-company shorthand labels for the People register columns ({} if none). */
export async function getColumnLabels(companyId: string): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("people_column_labels")
    .eq("id", companyId)
    .maybeSingle();
  return ((data?.people_column_labels as Record<string, string> | null) ?? {}) as Record<string, string>;
}

export async function listBranches(companyId: string): Promise<BranchLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name, kind")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("kind", { ascending: true })
    .order("name", { ascending: true });
  return (data as BranchLite[]) ?? [];
}

export async function listPeopleCheckDefinitions(companyId: string): Promise<CheckDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_definitions")
    .select("*")
    .eq("company_id", companyId)
    .eq("population", "people")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data as CheckDefinition[]) ?? [];
}

/** All People definitions (active and inactive) for the configuration screen. */
export async function listAllPeopleCheckDefinitions(companyId: string): Promise<CheckDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_definitions")
    .select("*")
    .eq("company_id", companyId)
    .eq("population", "people")
    .order("sort_order", { ascending: true });
  return (data as CheckDefinition[]) ?? [];
}

type PersonRow = PersonRecord & { branches: { name: string } | null };

function toPerson(row: PersonRow): PersonRecord {
  const { branches, ...rest } = row;
  return { ...rest, branch_name: branches?.name ?? null };
}

export async function getPerson(personId: string): Promise<PersonRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("*, branches(name)")
    .eq("id", personId)
    .maybeSingle();
  return data ? toPerson(data as PersonRow) : null;
}

/** The register matrix: active Records for a branch (or all visible), plus each
 *  Record's per-check status and rollup. Definitions are the matrix columns. */
export async function listRegister(
  companyId: string,
  branchId?: string | null,
): Promise<{ definitions: CheckDefinition[]; rows: RegisterRow[] }> {
  const supabase = await createClient();
  const definitions = await listPeopleCheckDefinitions(companyId);

  let query = supabase
    .from("people")
    .select("*, branches(name)")
    .eq("company_id", companyId)
    .neq("employment_status", "leaver")
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  if (branchId) query = query.eq("branch_id", branchId);

  const { data: peopleData } = await query;
  const people = ((peopleData as PersonRow[]) ?? []).map(toPerson);
  const ids = people.map((p) => p.id);

  if (ids.length === 0) return { definitions, rows: [] };

  const supFormId = definitions.find((d) => d.key === "supervision")?.form_id ?? null;

  const [{ data: statusData }, { data: rollupData }, { data: trackerData }, { data: supEvidence }] =
    await Promise.all([
      supabase.from("person_check_status").select("*").in("person_id", ids),
      supabase.from("person_rollup").select("*").in("person_id", ids),
      supabase.from("person_trackers").select("*").in("person_id", ids),
      supFormId
        ? supabase
            .from("evidence")
            .select("record_id, submitted_at, answers")
            .eq("record_type", "person")
            .eq("form_id", supFormId)
            .in("record_id", ids)
            .order("submitted_at", { ascending: true })
        : Promise.resolve({
            data: [] as Array<{ record_id: string; submitted_at: string; answers: Record<string, unknown> }>,
          }),
    ]);

  const statuses = (statusData as CheckStatus[]) ?? [];
  const rollups = (rollupData as PersonRollup[]) ?? [];
  const trackers = (trackerData as PersonTracker[]) ?? [];
  const defKeyById = new Map(definitions.map((d) => [d.id, d.key]));
  const rollupByPerson = new Map(rollups.map((r) => [r.person_id, r]));
  const trackerByPerson = new Map(trackers.map((t) => [t.person_id, t]));

  const statusByPerson = new Map<string, Record<string, CheckStatus>>();
  const statusByKeyByPerson = new Map<string, Record<string, CheckStatus>>();
  for (const s of statuses) {
    const byId = statusByPerson.get(s.person_id) ?? {};
    byId[s.definition_id] = s;
    statusByPerson.set(s.person_id, byId);
    const byKey = statusByKeyByPerson.get(s.person_id) ?? {};
    const key = defKeyById.get(s.definition_id) ?? s.check_key;
    byKey[key] = s;
    statusByKeyByPerson.set(s.person_id, byKey);
  }

  const supByPerson = new Map<string, Record<string, string>>();
  for (const e of (supEvidence as Array<{
    record_id: string;
    submitted_at: string;
    answers: Record<string, unknown>;
  }>) ?? []) {
    const slot = String(e.answers?.supervision_type ?? "");
    if (slot !== "1" && slot !== "2" && slot !== "3") continue;
    const map = supByPerson.get(e.record_id) ?? {};
    map[slot] = e.submitted_at.slice(0, 10);
    supByPerson.set(e.record_id, map);
  }

  const rows: RegisterRow[] = people.map((person) => ({
    person,
    rollup: rollupByPerson.get(person.id) ?? null,
    statuses: statusByPerson.get(person.id) ?? {},
    statusByKey: statusByKeyByPerson.get(person.id) ?? {},
    tracker: trackerByPerson.get(person.id) ?? null,
    supComps: supByPerson.get(person.id) ?? {},
  }));

  return { definitions, rows };
}

export async function getPersonTracker(personId: string): Promise<PersonTracker | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("person_trackers")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  return (data as PersonTracker | null) ?? null;
}

/** Supervision completion date keyed by the chosen slot ("1"|"2"|"3"), most recent
 *  completion of each slot winning. */
export async function getSupervisionComps(
  personId: string,
  supFormId: string | null,
): Promise<Record<string, string>> {
  if (!supFormId) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("submitted_at, answers")
    .eq("record_type", "person")
    .eq("record_id", personId)
    .eq("form_id", supFormId)
    .order("submitted_at", { ascending: true });
  const out: Record<string, string> = {};
  for (const e of (data as Array<{ submitted_at: string; answers: Record<string, unknown> }>) ?? []) {
    const slot = String(e.answers?.supervision_type ?? "");
    if (slot === "1" || slot === "2" || slot === "3") out[slot] = e.submitted_at.slice(0, 10);
  }
  return out;
}

export async function getPersonChecks(personId: string): Promise<CheckStatus[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("person_check_status")
    .select("*")
    .eq("person_id", personId);
  return (data as CheckStatus[]) ?? [];
}

/** A company Form by key, with its current published version (for tracker forms). */
export async function getCompanyFormByKey(
  companyId: string,
  key: string,
): Promise<{ formId: string; versionId: string; schema: unknown } | null> {
  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", key)
    .maybeSingle();
  if (!form) return null;
  const version = await getPublishedFormVersion(form.id as string);
  if (!version) return null;
  return { formId: form.id as string, versionId: version.id, schema: version.schema };
}

/** The current published version (id + schema) of a company Form. */
export async function getPublishedFormVersion(
  formId: string,
): Promise<{ id: string; version: number; schema: unknown } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_versions")
    .select("id, version, schema")
    .eq("form_id", formId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Users in the company who can be a line manager / team leader / supervisor. */
export async function listCompanyUsers(companyId: string): Promise<ProfileLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("full_name", { ascending: true });
  return (data as ProfileLite[]) ?? [];
}

/** Active users who can be a line manager, team leader or assigned supervisor,
 *  i.e. management/supervisory roles. Excludes Team Members. */
export async function listSupervisoryUsers(companyId: string): Promise<ProfileLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("role", ["company_admin", "manager", "supervisor"])
    .order("full_name", { ascending: true });
  return (data as ProfileLite[]) ?? [];
}

export type BranchStaff = Record<string, { managers: ProfileLite[]; supervisors: ProfileLite[] }>;

/** For each branch, the managers and supervisors assigned to it (via user_branches),
 *  so the Add Person form can auto-fill them when a branch is chosen. */
export async function getBranchStaffMap(companyId: string): Promise<BranchStaff> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_branches")
    .select("branch_id, profiles!inner(id, full_name, email, role, company_id, status)")
    .eq("profiles.company_id", companyId)
    .eq("profiles.status", "active")
    .in("profiles.role", ["manager", "supervisor"]);

  type Row = {
    branch_id: string;
    profiles:
      | { id: string; full_name: string; email: string; role: string }
      | Array<{ id: string; full_name: string; email: string; role: string }>
      | null;
  };
  const map: BranchStaff = {};
  for (const r of (data as Row[] | null) ?? []) {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    if (!p) continue;
    const entry = (map[r.branch_id] ??= { managers: [], supervisors: [] });
    const lite: ProfileLite = { id: p.id, full_name: p.full_name, email: p.email, role: p.role };
    if (p.role === "manager") entry.managers.push(lite);
    else if (p.role === "supervisor") entry.supervisors.push(lite);
  }
  return map;
}

export async function listPersonAssignments(personId: string): Promise<ProfileLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("person_assignments")
    .select("user_id, profiles:user_id(id, full_name, email, role)")
    .eq("person_id", personId);
  type Row = { profiles: ProfileLite | ProfileLite[] | null };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => (Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles))
    .filter((p): p is ProfileLite => p != null);
}

/** Evidence history for a Record (newest first), for the drill-down timeline. */
export async function listPersonEvidence(personId: string): Promise<
  Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, form_id, submitted_at, author_name")
    .eq("record_type", "person")
    .eq("record_id", personId)
    .order("submitted_at", { ascending: false });
  return (data as Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null }>) ?? [];
}
