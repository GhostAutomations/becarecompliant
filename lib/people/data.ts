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

export type JobTitle = { id: string; title: string };

/** Company-managed staff job titles, used for the Add a Person dropdown and the
 *  Settings > People management list. Ordered by sort_order then title. */
export async function listJobTitles(companyId: string): Promise<JobTitle[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_job_titles")
    .select("id, title")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  return (data as JobTitle[] | null) ?? [];
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

/** Which population the register is showing. active = Main; leaver = Leavers (not yet
 *  archived); lts_mat = Long Term Sick & Maternity Leave; archived = the Archive view;
 *  all = every status (loaded once so the client can switch views instantly). */
export type RegisterScope = "active" | "leaver" | "lts_mat" | "archived" | "all";

/** The register matrix: Records for a branch (or all visible) in the given scope,
 *  plus each Record's per-check status and rollup. Definitions are the columns.
 *  Uses the _all status/rollup views so non-active people still show check data;
 *  the dashboard/summary keep the active-only views (leavers excluded there). */
export async function listRegister(
  companyId: string,
  branchId?: string | null,
  scope: RegisterScope = "active",
): Promise<{ definitions: CheckDefinition[]; rows: RegisterRow[] }> {
  const supabase = await createClient();
  const definitions = await listPeopleCheckDefinitions(companyId);

  let query = supabase
    .from("people")
    .select("*, branches(name)")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });
  if (scope === "all") {
    // no status/archived filter: load everyone so the client can switch views instantly
  } else if (scope === "archived") {
    query = query.not("archived_at", "is", null);
  } else if (scope === "leaver") {
    query = query.eq("employment_status", "leaver").is("archived_at", null);
  } else if (scope === "lts_mat") {
    query = query.in("employment_status", ["lts", "mat_leave"]).is("archived_at", null);
  } else {
    query = query.eq("employment_status", "active").is("archived_at", null);
  }
  if (branchId) query = query.eq("branch_id", branchId);

  const { data: peopleData } = await query;
  const people = ((peopleData as PersonRow[]) ?? []).map(toPerson);
  const ids = people.map((p) => p.id);

  if (ids.length === 0) return { definitions, rows: [] };

  const supDef = definitions.find((d) => d.key === "supervision");
  const supFormId = supDef?.form_id ?? null;
  const supDefId = supDef?.id ?? null;
  const appraisalDef = definitions.find((d) => d.key === "appraisal");
  const appraisalFormId = appraisalDef?.form_id ?? null;
  const appraisalDefId = appraisalDef?.id ?? null;

  const [
    { data: statusData },
    { data: rollupData },
    { data: trackerData },
    { data: supEvidence },
    { data: supMigrated },
    { data: appraisalEvidence },
    { data: appraisalMigrated },
  ] = await Promise.all([
    supabase.from("person_check_status_all").select("*").in("person_id", ids),
    supabase.from("person_rollup_all").select("*").in("person_id", ids),
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
    supDefId
      ? supabase
          .from("migrated_completions")
          .select("record_id, completed_on")
          .eq("record_type", "person")
          .eq("definition_id", supDefId)
          .in("record_id", ids)
      : Promise.resolve({ data: [] as Array<{ record_id: string; completed_on: string }> }),
    appraisalFormId
      ? supabase
          .from("evidence")
          .select("record_id, submitted_at, answers")
          .eq("record_type", "person")
          .eq("form_id", appraisalFormId)
          .in("record_id", ids)
          .order("submitted_at", { ascending: true })
      : Promise.resolve({
          data: [] as Array<{ record_id: string; submitted_at: string; answers: Record<string, unknown> }>,
        }),
    appraisalDefId
      ? supabase
          .from("migrated_completions")
          .select("record_id, completed_on")
          .eq("record_type", "person")
          .eq("definition_id", appraisalDefId)
          .in("record_id", ids)
      : Promise.resolve({ data: [] as Array<{ record_id: string; completed_on: string }> }),
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

  // All supervision completion dates per person, from real evidence AND migrated
  // history. The Sup 1/2/3 slots are derived from these in date order (sequential
  // model), so the chosen "which supervision" number no longer drives the slots.
  const supDatesByPerson = new Map<string, string[]>();
  const pushSupDate = (pid: string, d: string | null) => {
    if (!d) return;
    const a = supDatesByPerson.get(pid) ?? [];
    a.push(d);
    supDatesByPerson.set(pid, a);
  };
  for (const e of (supEvidence as Array<{
    record_id: string;
    submitted_at: string;
    answers: Record<string, unknown>;
  }>) ?? []) {
    pushSupDate(e.record_id, supervisionCompDate(e.answers, e.submitted_at));
  }
  for (const m of (supMigrated as Array<{ record_id: string; completed_on: string }>) ?? []) {
    pushSupDate(m.record_id, m.completed_on);
  }

  // All appraisal completion dates per person (evidence + migrated). The count of
  // these drives the supervision cycle reset (each appraisal ends a 3-supervision
  // cycle), matching the count-based Service User review model.
  const appraisalDatesByPerson = new Map<string, string[]>();
  const pushAppraisalDate = (pid: string, d: string | null) => {
    if (!d) return;
    const a = appraisalDatesByPerson.get(pid) ?? [];
    a.push(d);
    appraisalDatesByPerson.set(pid, a);
  };
  for (const e of (appraisalEvidence as Array<{
    record_id: string;
    submitted_at: string;
    answers: Record<string, unknown>;
  }>) ?? []) {
    pushAppraisalDate(e.record_id, appraisalCompDate(e.answers, e.submitted_at));
  }
  for (const m of (appraisalMigrated as Array<{ record_id: string; completed_on: string }>) ?? []) {
    pushAppraisalDate(m.record_id, m.completed_on);
  }

  const rows: RegisterRow[] = people.map((person) => ({
    person,
    rollup: rollupByPerson.get(person.id) ?? null,
    statuses: statusByPerson.get(person.id) ?? {},
    statusByKey: statusByKeyByPerson.get(person.id) ?? {},
    tracker: trackerByPerson.get(person.id) ?? null,
    supCompDates: supDatesByPerson.get(person.id) ?? [],
    appraisalCompDates: appraisalDatesByPerson.get(person.id) ?? [],
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

/** The supervision completion date to display: the form's "Date of supervision"
 *  (when it actually happened) if captured, else the submission timestamp. */
function supervisionCompDate(answers: Record<string, unknown>, submittedAt: string): string {
  const d = answers?.supervision_date;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return submittedAt.slice(0, 10);
}

/** The appraisal completion date: the form's "Date of Appraisal" if captured,
 *  else the submission timestamp. */
function appraisalCompDate(answers: Record<string, unknown>, submittedAt: string): string {
  const d = answers?.date_of_appraisal;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return submittedAt.slice(0, 10);
}

/** All appraisal completion dates (ISO) for a person, from evidence AND migrated
 *  history. The COUNT of these drives the supervision cycle reset. */
export async function getAppraisalCompDates(
  personId: string,
  appraisalFormId: string | null,
  appraisalDefId: string | null,
): Promise<string[]> {
  const supabase = await createClient();
  const dates: string[] = [];
  if (appraisalFormId) {
    const { data } = await supabase
      .from("evidence")
      .select("submitted_at, answers")
      .eq("record_type", "person")
      .eq("record_id", personId)
      .eq("form_id", appraisalFormId)
      .order("submitted_at", { ascending: true });
    for (const e of (data as Array<{ submitted_at: string; answers: Record<string, unknown> }>) ?? []) {
      dates.push(appraisalCompDate(e.answers, e.submitted_at));
    }
  }
  if (appraisalDefId) {
    const { data } = await supabase
      .from("migrated_completions")
      .select("completed_on")
      .eq("record_type", "person")
      .eq("record_id", personId)
      .eq("definition_id", appraisalDefId);
    for (const m of (data as Array<{ completed_on: string }>) ?? []) dates.push(m.completed_on);
  }
  return dates;
}

/** All supervision completion dates (ISO) for a person, from real form evidence AND
 *  migrated history. The cycle slots are derived from these in date order. */
export async function getSupervisionCompDates(
  personId: string,
  supFormId: string | null,
  supDefId: string | null,
): Promise<string[]> {
  const supabase = await createClient();
  const dates: string[] = [];
  if (supFormId) {
    const { data } = await supabase
      .from("evidence")
      .select("submitted_at, answers")
      .eq("record_type", "person")
      .eq("record_id", personId)
      .eq("form_id", supFormId)
      .order("submitted_at", { ascending: true });
    for (const e of (data as Array<{ submitted_at: string; answers: Record<string, unknown> }>) ?? []) {
      dates.push(supervisionCompDate(e.answers, e.submitted_at));
    }
  }
  if (supDefId) {
    const { data } = await supabase
      .from("migrated_completions")
      .select("completed_on")
      .eq("record_type", "person")
      .eq("record_id", personId)
      .eq("definition_id", supDefId);
    for (const m of (data as Array<{ completed_on: string }>) ?? []) dates.push(m.completed_on);
  }
  return dates;
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
 *  so the Add Person form can auto-fill them when a branch is chosen. Two plain
 *  queries joined in JS (no PostgREST embed), so it is not sensitive to embedded
 *  resource / RLS quirks. */
export async function getBranchStaffMap(companyId: string): Promise<BranchStaff> {
  const supabase = await createClient();
  // Auto-fill uses each user's PRIMARY branch only: a user is auto-filled into the
  // branch they belong to, not the "additional branch views" they can merely see.
  const [{ data: ubs }, { data: profs }] = await Promise.all([
    supabase.from("user_branches").select("user_id, branch_id").eq("is_primary", true),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("company_id", companyId)
      .eq("status", "active")
      .in("role", ["manager", "supervisor"]),
  ]);

  const byId = new Map<string, ProfileLite>(
    ((profs as ProfileLite[] | null) ?? []).map((p) => [p.id, p]),
  );
  const map: BranchStaff = {};
  for (const ub of ((ubs as Array<{ user_id: string; branch_id: string }> | null) ?? [])) {
    const p = byId.get(ub.user_id);
    if (!p) continue;
    const entry = (map[ub.branch_id] ??= { managers: [], supervisors: [] });
    if (p.role === "manager") entry.managers.push(p);
    else if (p.role === "supervisor") entry.supervisors.push(p);
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
  Array<{ id: string; form_id: string; form_name: string | null; submitted_at: string; author_name: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, form_id, submitted_at, author_name, forms(name)")
    .eq("record_type", "person")
    .eq("record_id", personId)
    .order("submitted_at", { ascending: false });
  return ((data as unknown as Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null; forms: { name: string } | null }>) ?? []).map((e) => ({
    id: e.id,
    form_id: e.form_id,
    form_name: e.forms?.name ?? null,
    submitted_at: e.submitted_at,
    author_name: e.author_name,
  }));
}
