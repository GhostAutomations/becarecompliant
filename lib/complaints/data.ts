import "server-only";

/**
 * Be Care Compliant — Complaints (Phase 10 Additions) server data access. All
 * reads go through the RLS-scoped user client, so a Manager sees only their
 * branch(es), an Admin all branches, and Supervisors/Team Members nothing
 * (special-category data). Company-scoped helpers (accessible branches, form by
 * key) are shared with People/Service Users rather than duplicated.
 */

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_COMPLAINTS_CONFIG,
  type ComplaintRecord,
  type ComplaintsConfig,
} from "./types";

export { getCompanyFormByKey, getPublishedFormVersion } from "@/lib/people/data";
export { listAccessibleBranchTypes } from "@/lib/service-users/data";

type ComplaintRow = Omit<ComplaintRecord, "branch_name" | "service_user_name"> & {
  branches: { name: string } | null;
  service_users: { full_name: string } | null;
};

function toComplaint(row: ComplaintRow): ComplaintRecord {
  const { branches, service_users, ...rest } = row;
  return {
    ...rest,
    branch_name: branches?.name ?? null,
    service_user_name: service_users?.full_name ?? null,
  };
}

const COMPLAINT_SELECT =
  "*, branches(name), service_users:service_user_id(full_name)";

/** Per-company complaint response timescales, falling back to the cited defaults. */
export async function getComplaintsConfig(companyId: string): Promise<ComplaintsConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaints_config")
    .select("acknowledgement_days, response_days, amber_days, count_working_days")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return DEFAULT_COMPLAINTS_CONFIG;
  return {
    acknowledgement_days: data.acknowledgement_days ?? DEFAULT_COMPLAINTS_CONFIG.acknowledgement_days,
    response_days: data.response_days ?? DEFAULT_COMPLAINTS_CONFIG.response_days,
    amber_days: data.amber_days ?? DEFAULT_COMPLAINTS_CONFIG.amber_days,
    count_working_days: data.count_working_days ?? DEFAULT_COMPLAINTS_CONFIG.count_working_days,
  };
}

/** The Complaints register: every complaint the current user may see (newest
 *  first). RLS scopes the rows; the client filters by status and branch. */
export async function listComplaints(companyId: string): Promise<ComplaintRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaints")
    .select(COMPLAINT_SELECT)
    .eq("company_id", companyId)
    .order("date_raised", { ascending: false })
    .order("ref_number", { ascending: false });
  return ((data as ComplaintRow[] | null) ?? []).map(toComplaint);
}

export async function getComplaint(id: string): Promise<ComplaintRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaints")
    .select(COMPLAINT_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toComplaint(data as ComplaintRow) : null;
}

/** Open / In Progress / Closed counts plus overdue (response due passed, not
 *  closed) for the dashboard surface. */
export async function getComplaintCounts(
  companyId: string,
): Promise<{ open: number; inProgress: number; closed: number; overdue: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaints")
    .select("status, response_due")
    .eq("company_id", companyId);
  const counts = { open: 0, inProgress: 0, closed: 0, overdue: 0 };
  const today = new Date().toISOString().slice(0, 10);
  for (const r of (data as Array<{ status: string; response_due: string | null }> | null) ?? []) {
    if (r.status === "open") counts.open += 1;
    else if (r.status === "in_progress") counts.inProgress += 1;
    else if (r.status === "closed") counts.closed += 1;
    if (r.status !== "closed" && r.response_due && r.response_due < today) counts.overdue += 1;
  }
  return counts;
}

/** The company's Complaints forms (population = 'complaints') to attach as Evidence. */
export async function listComplaintForms(
  companyId: string,
): Promise<Array<{ id: string; key: string; name: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, key, name")
    .eq("company_id", companyId)
    .eq("population", "complaints")
    .eq("status", "active")
    .order("name", { ascending: true });
  return (data as Array<{ id: string; key: string; name: string }> | null) ?? [];
}

/** Active branch names for the company, used to hide other branches' region
 *  specific complaint forms (e.g. a Newport form on a Cardiff complaint). */
export async function listCompanyBranchNames(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("name")
    .eq("company_id", companyId)
    .eq("kind", "branch");
  return ((data as Array<{ name: string }> | null) ?? []).map((b) => b.name);
}

/** Active Service Users the user may see, for the optional complaint link dropdown. */
export async function listServiceUsersLite(
  companyId: string,
): Promise<Array<{ id: string; full_name: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("id, full_name")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  return (data as Array<{ id: string; full_name: string }> | null) ?? [];
}

/** Evidence attached to a complaint (newest first), for the drill-down timeline. */
export async function listComplaintEvidence(id: string): Promise<
  Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, form_id, submitted_at, author_name")
    .eq("record_type", "complaint")
    .eq("record_id", id)
    .order("submitted_at", { ascending: false });
  return (data as Array<{ id: string; form_id: string; submitted_at: string; author_name: string | null }>) ?? [];
}
