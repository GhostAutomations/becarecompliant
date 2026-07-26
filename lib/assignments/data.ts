import "server-only";

/**
 * Be Care Compliant — assignments and the policy library, read side.
 *
 * RLS does the scoping, not these queries: a Manager sees their branch, a
 * company-wide role sees everything, and a Team Member sees only their own rows
 * (assignments_select matches people.profile_id = auth.uid()).
 */

import { createClient } from "@/lib/supabase/server";
import type { AssignmentRow, CompanyPolicy } from "@/lib/assignments/types";

type RawAssignment = {
  id: string;
  kind: "form" | "policy";
  status: "assigned" | "completed" | "cancelled";
  due_date: string | null;
  assigned_at: string;
  completed_at: string | null;
  evidence_id: string | null;
  person_id: string;
  form_id: string | null;
  policy_id: string | null;
  people: { full_name: string } | { full_name: string }[] | null;
  forms: { name: string } | { name: string }[] | null;
  company_policies: { title: string } | { title: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const SELECT =
  "id, kind, status, due_date, assigned_at, completed_at, evidence_id, person_id, form_id, policy_id, people:person_id(full_name), forms:form_id(name), company_policies:policy_id(title)";

function shape(r: RawAssignment): AssignmentRow {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    due_date: r.due_date,
    assigned_at: r.assigned_at,
    completed_at: r.completed_at,
    evidence_id: r.evidence_id,
    person_id: r.person_id,
    person_name: one(r.people)?.full_name ?? null,
    title:
      r.kind === "policy"
        ? (one(r.company_policies)?.title ?? "Policy")
        : (one(r.forms)?.name ?? "Form"),
    form_id: r.form_id,
    policy_id: r.policy_id,
  };
}

/** Everything assigned across the company (Managers and above). */
export async function listAssignments(companyId: string): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select(SELECT)
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .order("assigned_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as RawAssignment[]).map(shape);
}

/** What is open for one Person, for their own area and their record. */
export async function listAssignmentsForPerson(personId: string): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select(SELECT)
    .eq("person_id", personId)
    .neq("status", "cancelled")
    .order("status")
    .order("due_date", { nullsFirst: false })
    .limit(100);
  return ((data ?? []) as RawAssignment[]).map(shape);
}

/** The company's policy library. Staff only ever see policies assigned to them. */
export async function listPolicies(
  companyId: string,
  includeArchived = false,
): Promise<CompanyPolicy[]> {
  const supabase = await createClient();
  let q = supabase
    .from("company_policies")
    .select("id, title, summary, file_name, version, status, created_at")
    .eq("company_id", companyId)
    .order("title");
  if (!includeArchived) q = q.eq("status", "active");
  const { data } = await q;
  return (data ?? []) as CompanyPolicy[];
}

/** Forms a Manager can hand out. The acknowledgement form is machinery, not a
 *  form anybody assigns by hand, so it is never offered. */
export async function listAssignableForms(
  companyId: string,
): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, name, key")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("population", "people")
    .order("name");
  return ((data ?? []) as Array<{ id: string; name: string; key: string }>)
    .filter((f) => f.key !== "policy_acknowledgement")
    .map((f) => ({ id: f.id, name: f.name }));
}

/** Published schemas for a set of forms, so an assigned form can be rendered. */
export async function getPublishedSchemas(
  formIds: string[],
): Promise<Record<string, { versionId: string; schema: unknown }>> {
  if (formIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_versions")
    .select("id, form_id, version, schema")
    .in("form_id", formIds)
    .eq("status", "published")
    .order("version", { ascending: true });

  const out: Record<string, { versionId: string; schema: unknown }> = {};
  for (const row of (data ?? []) as Array<{ id: string; form_id: string; schema: unknown }>) {
    // Ascending order means the last write wins, which is the highest version.
    out[row.form_id] = { versionId: row.id, schema: row.schema };
  }
  return out;
}
