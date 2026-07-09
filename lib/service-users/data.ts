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

  const [{ data: statusData }, { data: rollupData }, { data: trackerData }] = await Promise.all([
    supabase.from("service_user_check_status_all").select("*").in("service_user_id", ids),
    supabase.from("service_user_rollup_all").select("*").in("service_user_id", ids),
    supabase
      .from("service_user_trackers")
      .select("*, reviewer:planned_reviewer_id(full_name)")
      .in("service_user_id", ids),
  ]);

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
  Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, form_id, submitted_at, author_name")
    .eq("record_type", "service_user")
    .eq("record_id", id)
    .order("submitted_at", { ascending: false });
  return (data as Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null }>) ?? [];
}
