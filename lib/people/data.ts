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
  RegisterRow,
} from "./types";

export type BranchLite = { id: string; name: string; kind: string };
export type ProfileLite = { id: string; full_name: string; email: string; role: string };

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
    .eq("employment_status", "active")
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  if (branchId) query = query.eq("branch_id", branchId);

  const { data: peopleData } = await query;
  const people = ((peopleData as PersonRow[]) ?? []).map(toPerson);
  const ids = people.map((p) => p.id);

  if (ids.length === 0) return { definitions, rows: [] };

  const [{ data: statusData }, { data: rollupData }] = await Promise.all([
    supabase.from("person_check_status").select("*").in("person_id", ids),
    supabase.from("person_rollup").select("*").in("person_id", ids),
  ]);

  const statuses = (statusData as CheckStatus[]) ?? [];
  const rollups = (rollupData as PersonRollup[]) ?? [];
  const rollupByPerson = new Map(rollups.map((r) => [r.person_id, r]));
  const statusByPerson = new Map<string, Record<string, CheckStatus>>();
  for (const s of statuses) {
    const map = statusByPerson.get(s.person_id) ?? {};
    map[s.definition_id] = s;
    statusByPerson.set(s.person_id, map);
  }

  const rows: RegisterRow[] = people.map((person) => ({
    person,
    rollup: rollupByPerson.get(person.id) ?? null,
    statuses: statusByPerson.get(person.id) ?? {},
  }));

  return { definitions, rows };
}

export async function getPersonChecks(personId: string): Promise<CheckStatus[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("person_check_status")
    .select("*")
    .eq("person_id", personId);
  return (data as CheckStatus[]) ?? [];
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
