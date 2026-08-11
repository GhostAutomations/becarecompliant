import "server-only";

/**
 * Be Care Compliant — assignments and the policy library, read side.
 *
 * RLS does the scoping, not these queries: a Manager sees their branch, a
 * company-wide role sees everything, and a Team Member sees only their own rows
 * (assignments_select matches people.profile_id = auth.uid()).
 */

import { createClient } from "@/lib/supabase/server";
import { isSendableAddress } from "@/lib/email/resend";
import { isBriefableFormKey } from "@/lib/assignments/briefable";
import type {
  AssignmentRow,
  BriefingPerson,
  CompanyPolicy,
  PolicyConfig,
  PolicyVersion,
} from "@/lib/assignments/types";

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
  policy_version: number | null;
  people: { full_name: string } | { full_name: string }[] | null;
  forms: { name: string } | { name: string }[] | null;
  company_policies: PolicyJoin | PolicyJoin[] | null;
};

type PolicyJoin = {
  title: string;
  source: string | null;
  body: string | null;
  signature_mode: string | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const SELECT =
  "id, kind, status, due_date, assigned_at, completed_at, evidence_id, person_id, form_id, policy_id, policy_version, people:person_id(full_name), forms:form_id(name), company_policies:policy_id(title, source, body, signature_mode)";

function shape(r: RawAssignment): AssignmentRow {
  return {
    id: r.id,
    policy_version: r.policy_version,
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
    policy_source: (one(r.company_policies)?.source as "upload" | "text" | null) ?? null,
    policy_body: one(r.company_policies)?.body ?? null,
    policy_signature_mode:
      (one(r.company_policies)?.signature_mode as "draw" | "type" | "either" | null) ?? null,
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
    .select(
      "id, title, summary, file_name, version, status, created_at, source, body, signature_mode, reassign_on_new_version, assign_to_new_starters",
    )
    .eq("company_id", companyId)
    .order("title");
  if (!includeArchived) q = q.eq("status", "active");
  const { data } = await q;
  // The columns are nullable in the database (null = follow the company default),
  // but the screen has to show a real answer, so resolve it here rather than
  // letting a label render as undefined.
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...(row as unknown as CompanyPolicy),
    source: (row.source as CompanyPolicy["source"] | null) ?? "upload",
    signature_mode: (row.signature_mode as CompanyPolicy["signature_mode"] | null) ?? "either",
    reassign_on_new_version:
      (row.reassign_on_new_version as CompanyPolicy["reassign_on_new_version"] | null) ?? "always",
    assign_to_new_starters: row.assign_to_new_starters === true,
  }));
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
    .filter((f) => isBriefableFormKey(f.key))
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

/**
 * The company's signing rules. Defaults matter here: a company that has never
 * opened the settings gets "draw or type" and "everyone signs the new version",
 * which is the behaviour a care inspector would expect by default.
 */
export async function getPolicyConfig(companyId: string): Promise<PolicyConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_config")
    .select("signature_mode, reassign_on_new_version")
    .eq("company_id", companyId)
    .maybeSingle();
  return {
    signature_mode: (data?.signature_mode as PolicyConfig["signature_mode"]) ?? "either",
    reassign_on_new_version:
      (data?.reassign_on_new_version as PolicyConfig["reassign_on_new_version"]) ?? "always",
  };
}

/** Every version of one policy, newest first. */
export async function listPolicyVersions(policyId: string): Promise<PolicyVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_policy_versions")
    .select("id, policy_id, version, file_name, created_at")
    .eq("policy_id", policyId)
    .order("version", { ascending: false });
  return (data ?? []) as PolicyVersion[];
}

/**
 * Who a briefing can go to: everyone on the register who is still employed.
 *
 * RLS scopes it, so a Branch Manager's "everyone" is their branch, which is why
 * the counts in the panel are safe to show. The branch id comes back too, because
 * the audience is chosen by branch and names are not unique enough to trust.
 */
export async function listBriefingAudience(companyId: string): Promise<BriefingPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name, branch_id, work_email, branches:branch_id(name)")
    .eq("company_id", companyId)
    .neq("employment_status", "leaver")
    .is("archived_at", null)
    .order("full_name");
  return ((data ?? []) as Array<{
    id: string;
    full_name: string;
    branch_id: string | null;
    work_email: string | null;
    branches: { name: string } | { name: string }[] | null;
  }>).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    branch_id: p.branch_id,
    branch_name: (Array.isArray(p.branches) ? (p.branches[0] ?? null) : p.branches)?.name ?? null,
    has_email: isSendableAddress(p.work_email),
  }));
}

/**
 * The signing rules that actually apply to one policy (0137).
 *
 * A policy carries its own; a policy created before 0137, or one left unset,
 * falls back to the company's remembered default. Every place that decides how a
 * signature is captured must go through this, so the rule is never read from two
 * sources that can disagree.
 */
export async function getEffectivePolicyRules(
  companyId: string,
  policyId: string,
): Promise<PolicyConfig> {
  const supabase = await createClient();
  const [{ data: policy }, defaults] = await Promise.all([
    supabase
      .from("company_policies")
      .select("signature_mode, reassign_on_new_version")
      .eq("id", policyId)
      .maybeSingle(),
    getPolicyConfig(companyId),
  ]);
  return {
    signature_mode:
      (policy?.signature_mode as PolicyConfig["signature_mode"] | null) ?? defaults.signature_mode,
    reassign_on_new_version:
      (policy?.reassign_on_new_version as PolicyConfig["reassign_on_new_version"] | null) ??
      defaults.reassign_on_new_version,
  };
}
