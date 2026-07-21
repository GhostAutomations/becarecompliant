import "server-only";

/**
 * Be Care Compliant — Service Users (Phase 4) server data access. All reads go
 * through the RLS-scoped user client, so a Manager sees their branch(es), an
 * assigned user their caseload, and an unassigned Team Member sees nothing (special
 * category data). Active views exclude cancelled and archived Records.
 *
 * Company-scoped helpers (listBranches, listSupervisoryUsers, getBranchStaffMap,
 * getPublishedFormVersion, getCompanyFormByKey) are shared with People and imported
 * from there rather than duplicated.
 */

import { createClient } from "@/lib/supabase/server";
import type { CheckDefinition } from "@/lib/people/types";
import type {
  ServiceUserRecord,
  ServiceUserRollup,
  ServiceUserRow,
  ServiceUserTracker,
  SuCheckStatus,
} from "./types";

export {
  listBranches,
  listSupervisoryUsers,
  getBranchStaffMap,
  getPublishedFormVersion,
  getCompanyFormByKey,
  type BranchLite,
  type ProfileLite,
  type BranchStaff,
} from "@/lib/people/data";

/** Record-level RAG counts for the Compliance Summary (optionally per branch). */
export async function getServiceUserRollupCounts(
  companyId: string,
  branchId?: string | null,
): Promise<{ compliant: number; dueSoon: number; overdue: number; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("service_user_rollup")
    .select("rag, branch_id")
    .eq("company_id", companyId);
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

/** Per-company shorthand labels for the Service User register columns ({} if none). */
export async function getServiceUserColumnLabels(companyId: string): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("service_user_column_labels")
    .eq("id", companyId)
    .maybeSingle();
  return ((data?.service_user_column_labels as Record<string, string> | null) ?? {}) as Record<string, string>;
}

/** The company Complex review interval in days (default 80). */
export async function getComplexReviewInterval(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("complex_review_interval_days")
    .eq("id", companyId)
    .maybeSingle();
  return (data?.complex_review_interval_days as number | null) ?? 80;
}

export type BranchType = { id: string; name: string; service_user_type: "simple" | "complex" };

/** Active branches (not the office/team) with their Service User type, for the
 *  Settings > Service Users Type section (Admin only, so all branches). */
export async function listBranchTypes(companyId: string): Promise<BranchType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name, service_user_type")
    .eq("company_id", companyId)
    .eq("kind", "branch")
    .eq("status", "active")
    .order("name", { ascending: true });
  return (data as BranchType[]) ?? [];
}

/** The branches (not the office/team) the current user may work in: Admin and
 *  Platform see all; everyone else (Managers, Supervisors, Team Members) sees only
 *  the branches they are assigned to (user_branches). Used for the register Branches
 *  dropdown and the Add Service User branch picker, so a user never sees a branch they
 *  are not assigned to. */
export async function listAccessibleBranchTypes(
  companyId: string,
  role: string,
  userId: string,
): Promise<BranchType[]> {
  const supabase = await createClient();
  let branchIds: string[] | null = null;
  if (role !== "company_admin" && role !== "platform_admin") {
    const { data: ubs } = await supabase.from("user_branches").select("branch_id").eq("user_id", userId);
    branchIds = ((ubs as Array<{ branch_id: string }> | null) ?? []).map((r) => r.branch_id);
    if (branchIds.length === 0) return [];
  }
  let query = supabase
    .from("branches")
    .select("id, name, service_user_type")
    .eq("company_id", companyId)
    .eq("kind", "branch")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (branchIds) query = query.in("id", branchIds);
  const { data } = await query;
  return (data as BranchType[]) ?? [];
}

export async function listServiceUserCheckDefinitions(companyId: string): Promise<CheckDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_definitions")
    .select("*")
    .eq("company_id", companyId)
    .eq("population", "service_users")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data as CheckDefinition[]) ?? [];
}

/** All SU definitions (active and inactive) for the configuration screen. */
export async function listAllServiceUserCheckDefinitions(companyId: string): Promise<CheckDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_definitions")
    .select("*")
    .eq("company_id", companyId)
    .eq("population", "service_users")
    .order("sort_order", { ascending: true });
  return (data as CheckDefinition[]) ?? [];
}

type SuRow = ServiceUserRecord & { branches: { name: string } | null };

function toServiceUser(row: SuRow): ServiceUserRecord {
  const { branches, ...rest } = row;
  return { ...rest, branch_name: branches?.name ?? null };
}

/** The CURRENT (open) care plan version's entries, for the editor. */
export async function getCarePlanEntries(
  serviceUserId: string,
): Promise<import("./care-plan-consts").CarePlanEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("care_plan_entries")
    .select("id, day_of_week, service, unit, handed, quantity, position")
    .eq("service_user_id", serviceUserId)
    .is("effective_to", null)
    .order("position", { ascending: true });
  return ((data as Array<{
    id: string;
    day_of_week: number;
    service: string;
    unit: string;
    handed: string;
    quantity: number;
    position: number;
  }> | null) ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

export type CarePlanVersion = {
  effective_from: string;
  effective_to: string | null;
  entries: import("./care-plan-consts").CarePlanEntry[];
};

/** The current open version's effective_from (null if no plan yet). */
export async function getCurrentCarePlanFrom(serviceUserId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("care_plan_entries")
    .select("effective_from")
    .eq("service_user_id", serviceUserId)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.effective_from as string | undefined) ?? null;
}

/** Superseded (closed) care plan versions, newest first, for the collapsed history. */
export async function getCarePlanVersions(serviceUserId: string): Promise<CarePlanVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("care_plan_entries")
    .select("day_of_week, service, unit, handed, quantity, position, effective_from, effective_to")
    .eq("service_user_id", serviceUserId)
    .not("effective_to", "is", null)
    .order("effective_from", { ascending: false })
    .order("position", { ascending: true });
  const rows = (data as Array<{
    day_of_week: number; service: string; unit: string; handed: string;
    quantity: number; position: number; effective_from: string; effective_to: string;
  }> | null) ?? [];
  const byVersion = new Map<string, CarePlanVersion>();
  for (const r of rows) {
    const key = `${r.effective_from}|${r.effective_to}`;
    let v = byVersion.get(key);
    if (!v) {
      v = { effective_from: r.effective_from, effective_to: r.effective_to, entries: [] };
      byVersion.set(key, v);
    }
    v.entries.push({
      id: `${key}-${r.position}`,
      day_of_week: r.day_of_week,
      service: r.service,
      unit: r.unit,
      handed: r.handed,
      quantity: Number(r.quantity),
      position: r.position,
    });
  }
  return [...byVersion.values()];
}

export async function getServiceUserOutcomes(
  serviceUserId: string,
): Promise<import("./outcome-consts").OutcomeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_user_outcomes")
    .select("id, statement, status, last_reviewed, review_note, position")
    .eq("service_user_id", serviceUserId)
    .order("position", { ascending: true });
  return ((data as Array<{
    id: string;
    statement: string;
    status: import("./outcome-consts").OutcomeStatus;
    last_reviewed: string | null;
    review_note: string | null;
    position: number;
  }> | null) ?? []);
}

export type OutcomesRegisterRow = {
  id: string;
  full_name: string;
  branch_name: string | null;
  total: number; // outcomes in scope (excludes "no longer relevant")
  achievingOrProgressing: number;
  pct: number | null; // % achieving or progressing, or null when no in-scope outcomes
};

export type OutcomesRegister = {
  rows: OutcomesRegisterRow[];
  totalInScope: number;
  totalAchievingOrProgressing: number;
  pqsPct: number | null;
};

/** Company-wide personal outcomes rollup for the register and the PQS headline %. */
export async function getOutcomesRegister(companyId: string): Promise<OutcomesRegister> {
  const supabase = await createClient();
  const [{ data: sus }, { data: outcomes }] = await Promise.all([
    supabase
      .from("service_users")
      .select("id, full_name, branch_id, branches(name)")
      .eq("company_id", companyId)
      .eq("service_status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("service_user_outcomes")
      .select("service_user_id, status")
      .eq("company_id", companyId),
  ]);

  const byId = new Map<string, { inScope: number; ap: number }>();
  for (const o of (outcomes as Array<{ service_user_id: string; status: string }> | null) ?? []) {
    if (o.status === "no_longer_relevant") continue;
    const rec = byId.get(o.service_user_id) ?? { inScope: 0, ap: 0 };
    rec.inScope += 1;
    if (o.status === "achieved" || o.status === "progressing") rec.ap += 1;
    byId.set(o.service_user_id, rec);
  }

  let totalInScope = 0;
  let totalAP = 0;
  const rows: OutcomesRegisterRow[] = ((sus as Array<{
    id: string;
    full_name: string;
    branch_id: string;
    branches: { name: string } | null;
  }> | null) ?? []).map((s) => {
    const rec = byId.get(s.id) ?? { inScope: 0, ap: 0 };
    totalInScope += rec.inScope;
    totalAP += rec.ap;
    return {
      id: s.id,
      full_name: s.full_name,
      branch_name: s.branches?.name ?? null,
      total: rec.inScope,
      achievingOrProgressing: rec.ap,
      pct: rec.inScope > 0 ? Math.round((rec.ap / rec.inScope) * 100) : null,
    };
  });

  return {
    rows,
    totalInScope,
    totalAchievingOrProgressing: totalAP,
    pqsPct: totalInScope > 0 ? Math.round((totalAP / totalInScope) * 100) : null,
  };
}

export async function getServiceUser(id: string): Promise<ServiceUserRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("*, branches(name)")
    .eq("id", id)
    .maybeSingle();
  return data ? toServiceUser(data as SuRow) : null;
}

/** active = Main; hospital / respite / cancelled = the status views; all = every
 *  status (loaded once so the client can switch views instantly). */
export type SuRegisterScope = "active" | "hospital" | "respite" | "cancelled" | "all";

/** The register: Records for a branch (or all visible) in the given scope, plus
 *  each Record's per-check status and rollup and its tracker (Planned Review Date +
 *  reviewer). Uses the _all views so non-active Service Users still show check data;
 *  the dashboard/summary keep the active-only views (cancelled excluded there). */
export async function listRegister(
  companyId: string,
  branchId?: string | null,
  scope: SuRegisterScope = "active",
): Promise<{ definitions: CheckDefinition[]; rows: ServiceUserRow[] }> {
  const supabase = await createClient();
  const definitions = await listServiceUserCheckDefinitions(companyId);

  let query = supabase
    .from("service_users")
    .select("*, branches(name)")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });
  if (scope === "all") {
    // no status/archived filter: load everyone so the client can switch views instantly
  } else if (scope === "cancelled") {
    query = query.eq("service_status", "cancelled").is("archived_at", null);
  } else if (scope === "hospital") {
    query = query.eq("service_status", "hospital").is("archived_at", null);
  } else if (scope === "respite") {
    query = query.eq("service_status", "respite").is("archived_at", null);
  } else {
    query = query.eq("service_status", "active").is("archived_at", null);
  }
  if (branchId) query = query.eq("branch_id", branchId);

  const { data: suData } = await query;
  const serviceUsers = ((suData as SuRow[]) ?? []).map(toServiceUser);
  const ids = serviceUsers.map((s) => s.id);
  if (ids.length === 0) return { definitions, rows: [] };

  const reviewDef = definitions.find((d) => d.key === "care_plan_review");
  const reviewFormId = reviewDef?.form_id ?? null;
  const reviewDefId = reviewDef?.id ?? null;

  const [
    { data: statusData },
    { data: rollupData },
    { data: trackerData },
    { data: reviewEvidence },
    { data: reviewMigrated },
  ] = await Promise.all([
    supabase.from("service_user_check_status_all").select("*").in("service_user_id", ids),
    supabase.from("service_user_rollup_all").select("*").in("service_user_id", ids),
    supabase
      .from("service_user_trackers")
      .select("*, reviewer:planned_reviewer_id(full_name)")
      .in("service_user_id", ids),
    reviewFormId
      ? supabase
          .from("evidence")
          .select("record_id, submitted_at, answers")
          .eq("record_type", "service_user")
          .eq("form_id", reviewFormId)
          .in("record_id", ids)
          .order("submitted_at", { ascending: true })
      : Promise.resolve({
          data: [] as Array<{ record_id: string; submitted_at: string; answers: Record<string, unknown> }>,
        }),
    reviewDefId
      ? supabase
          .from("migrated_completions")
          .select("record_id, completed_on")
          .eq("record_type", "service_user")
          .eq("definition_id", reviewDefId)
          .in("record_id", ids)
      : Promise.resolve({ data: [] as Array<{ record_id: string; completed_on: string }> }),
  ]);

  // ALL Care Plan Review completion dates per Service User (oldest first), used to
  // derive the Review 1-4 slots positionally on Complex branches. Completion date =
  // the form's review_date when captured, else the submission timestamp. Positional
  // (not keyed by review number) so switching a branch Simple <-> Complex reuses the
  // same completions.
  const reviewCompsBySu = new Map<string, string[]>();
  for (const e of (reviewEvidence as Array<{
    record_id: string;
    submitted_at: string;
    answers: Record<string, unknown>;
  }>) ?? []) {
    const d = e.answers?.review_date;
    const iso = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : e.submitted_at.slice(0, 10);
    const list = reviewCompsBySu.get(e.record_id) ?? [];
    list.push(iso);
    reviewCompsBySu.set(e.record_id, list);
  }
  // Merge migrated review history (imported companies) alongside real evidence.
  for (const m of (reviewMigrated as Array<{ record_id: string; completed_on: string }>) ?? []) {
    const list = reviewCompsBySu.get(m.record_id) ?? [];
    list.push(m.completed_on);
    reviewCompsBySu.set(m.record_id, list);
  }
  // Keep each list in completion-date order.
  for (const [, list] of reviewCompsBySu) list.sort();

  const statuses = (statusData as SuCheckStatus[]) ?? [];
  const rollups = (rollupData as ServiceUserRollup[]) ?? [];
  const defKeyById = new Map(definitions.map((d) => [d.id, d.key]));
  const rollupBySu = new Map(rollups.map((r) => [r.service_user_id, r]));

  type TrackerRow = ServiceUserTracker & { reviewer: { full_name: string | null } | null };
  const trackerBySu = new Map<string, ServiceUserTracker>();
  for (const t of (trackerData as TrackerRow[] | null) ?? []) {
    const { reviewer, ...rest } = t;
    trackerBySu.set(t.service_user_id, { ...rest, planned_reviewer_name: reviewer?.full_name ?? null });
  }

  const statusByKeyBySu = new Map<string, Record<string, SuCheckStatus>>();
  for (const s of statuses) {
    const byKey = statusByKeyBySu.get(s.service_user_id) ?? {};
    const key = defKeyById.get(s.definition_id) ?? s.check_key;
    byKey[key] = s;
    statusByKeyBySu.set(s.service_user_id, byKey);
  }

  const rows: ServiceUserRow[] = serviceUsers.map((service_user) => ({
    service_user,
    rollup: rollupBySu.get(service_user.id) ?? null,
    statusByKey: statusByKeyBySu.get(service_user.id) ?? {},
    tracker: trackerBySu.get(service_user.id) ?? null,
    reviewComps: reviewCompsBySu.get(service_user.id) ?? [],
  }));

  return { definitions, rows };
}

export async function getServiceUserTracker(id: string): Promise<ServiceUserTracker | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_user_trackers")
    .select("*, reviewer:planned_reviewer_id(full_name)")
    .eq("service_user_id", id)
    .maybeSingle();
  if (!data) return null;
  const { reviewer, ...rest } = data as ServiceUserTracker & { reviewer: { full_name: string | null } | null };
  return { ...rest, planned_reviewer_name: reviewer?.full_name ?? null };
}

/** All Care Plan Review completion dates for one Service User (oldest first), used to
 *  derive the Review 1-4 slots positionally on Complex branches. */
export async function getReviewComps(
  serviceUserId: string,
  reviewFormId: string | null,
  reviewDefId: string | null = null,
): Promise<string[]> {
  const supabase = await createClient();
  const out: string[] = [];
  if (reviewFormId) {
    const { data } = await supabase
      .from("evidence")
      .select("submitted_at, answers")
      .eq("record_type", "service_user")
      .eq("record_id", serviceUserId)
      .eq("form_id", reviewFormId)
      .order("submitted_at", { ascending: true });
    for (const e of (data as Array<{ submitted_at: string; answers: Record<string, unknown> }>) ?? []) {
      const d = e.answers?.review_date;
      out.push(typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : e.submitted_at.slice(0, 10));
    }
  }
  if (reviewDefId) {
    const { data } = await supabase
      .from("migrated_completions")
      .select("completed_on")
      .eq("record_type", "service_user")
      .eq("record_id", serviceUserId)
      .eq("definition_id", reviewDefId);
    for (const m of (data as Array<{ completed_on: string }>) ?? []) out.push(m.completed_on);
  }
  return out.sort();
}

/** Is a Service User on a Complex branch, and the company Complex review interval. */
export async function getServiceUserBranchType(
  serviceUserId: string,
): Promise<{ isComplex: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("branches(service_user_type)")
    .eq("id", serviceUserId)
    .maybeSingle();
  const branch = (data as { branches: { service_user_type: string } | null } | null)?.branches;
  return { isComplex: branch?.service_user_type === "complex" };
}

export async function getServiceUserChecks(id: string): Promise<SuCheckStatus[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_user_check_status")
    .select("*")
    .eq("service_user_id", id);
  return (data as SuCheckStatus[]) ?? [];
}

export async function listServiceUserAssignments(id: string): Promise<
  Array<{ id: string; full_name: string; email: string; role: string }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_user_assignments")
    .select("user_id, profiles:user_id(id, full_name, email, role)")
    .eq("service_user_id", id);
  type Row = { profiles: { id: string; full_name: string; email: string; role: string } | Array<{ id: string; full_name: string; email: string; role: string }> | null };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => (Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles))
    .filter((p): p is { id: string; full_name: string; email: string; role: string } => p != null);
}

/** Evidence history for a Record (newest first), for the drill-down timeline. */
export async function listServiceUserEvidence(id: string): Promise<
  Array<{ id: string; form_id: string; form_name: string | null; submitted_at: string; author_name: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, form_id, submitted_at, author_name, forms(name)")
    .eq("record_type", "service_user")
    .eq("record_id", id)
    .order("submitted_at", { ascending: false });
  return ((data as unknown as Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null; forms: { name: string } | null }>) ?? []).map((e) => ({
    id: e.id,
    form_id: e.form_id,
    form_name: e.forms?.name ?? null,
    submitted_at: e.submitted_at,
    author_name: e.author_name,
  }));
}
