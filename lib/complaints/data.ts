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

export type ComplaintResponseRow = {
  id: string;
  method: string;
  kind: string;
  subject: string | null;
  body: string;
  recipient: string | null;
  sent_at: string | null;
  created_at: string;
  author_name: string | null;
};

type ComplaintResponseDbRow = Omit<ComplaintResponseRow, "author_name"> & {
  created_by: string | null;
};

const RESPONSE_COLS = "id, method, kind, subject, body, recipient, sent_at, created_at, created_by";

export type InvestigationAttachment = {
  path: string;
  name: string;
  mime: string;
  fieldKey: string;
};

/** The latest completed Complaint Investigation form for a complaint: its answers
 *  (source material for the AI response) and any uploaded file attachments. */
export async function getInvestigationEvidence(
  companyId: string,
  complaintId: string,
): Promise<{ id: string; answers: Record<string, unknown>; attachments: InvestigationAttachment[] } | null> {
  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", "complaints_concerns")
    .maybeSingle();
  if (!form) return null;

  const { data: ev } = await supabase
    .from("evidence")
    .select("id, answers")
    .eq("record_type", "complaint")
    .eq("record_id", complaintId)
    .eq("form_id", form.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ev) return null;

  const { data: files } = await supabase
    .from("evidence_files")
    .select("storage_path, file_name, mime_type, field_key, kind")
    .eq("evidence_id", ev.id);

  const attachments = ((files as Array<{ storage_path: string; file_name: string; mime_type: string; field_key: string; kind: string }> | null) ?? [])
    .filter((f) => f.kind === "upload")
    .map((f) => ({ path: f.storage_path, name: f.file_name, mime: f.mime_type, fieldKey: f.field_key }));

  return { id: ev.id, answers: (ev.answers as Record<string, unknown>) ?? {}, attachments };
}

/** Resolve author display names for a set of user ids (created_by references
 *  auth.users, so it cannot be embedded; profiles share the same id). */
async function authorNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", unique);
  return new Map(
    ((data as Array<{ id: string; full_name: string | null; email: string | null }> | null) ?? []).map((p) => [
      p.id,
      p.full_name || p.email || "Unknown",
    ]),
  );
}

/** Initial responses drafted/sent for a complaint (newest first). */
export async function listComplaintResponses(complaintId: string): Promise<ComplaintResponseRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaint_responses")
    .select(RESPONSE_COLS)
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: false });
  const rows = (data as ComplaintResponseDbRow[] | null) ?? [];
  const names = await authorNames(supabase, rows.map((r) => r.created_by ?? ""));
  return rows.map(({ created_by, ...rest }) => ({
    ...rest,
    author_name: created_by ? names.get(created_by) ?? null : null,
  }));
}

/** One recorded response, for its own view page. */
export async function getComplaintResponse(id: string): Promise<ComplaintResponseRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("complaint_responses").select(RESPONSE_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const { created_by, ...rest } = data as ComplaintResponseDbRow;
  const names = await authorNames(supabase, [created_by ?? ""]);
  return { ...rest, author_name: created_by ? names.get(created_by) ?? null : null };
}

/** Evidence attached to a complaint (newest first), for the drill-down timeline. */
export async function listComplaintEvidence(id: string): Promise<
  Array<{ id: string; form_id: string; form_name: string | null; submitted_at: string; author_name: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, form_id, submitted_at, author_name, forms(name)")
    .eq("record_type", "complaint")
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
