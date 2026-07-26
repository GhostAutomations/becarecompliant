import "server-only";

/**
 * Be Care Compliant — public form reads.
 *
 * Two very different callers live here, deliberately kept apart:
 *
 *  - resolvePublicForm() serves the PUBLIC page. There is no session, so it uses
 *    the service client, but it reads ONLY what the page has to render: the
 *    company's name and the published form schema, and only when an enabled link
 *    exists. Nothing about staff, records or other submissions is ever read.
 *  - the rest are normal in-app reads through the RLS client, so a Manager sees
 *    exactly what the policies allow and nothing more.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { isLinkCode, publicFormDef } from "@/lib/public-forms/config";
import type { PublicFormLink, PublicSubmission } from "@/lib/public-forms/types";

export type ResolvedPublicForm = {
  companyId: string;
  companyName: string;
  formKey: string;
  formVersionId: string;
  schema: FormSchema;
};

/**
 * Resolve a short link code to the form it publishes. Returns null for anything
 * that is not live: unknown code, link switched off, disabled company, form
 * missing, no published version, or a form key that is not in the publishable
 * catalogue. Every failure looks the same to the caller.
 */
export async function resolvePublicForm(code: string): Promise<ResolvedPublicForm | null> {
  if (!isLinkCode(code)) return null;

  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from("public_form_links")
    .select("company_id, form_key, enabled")
    .ilike("code", code)
    .maybeSingle();
  if (!link || !link.enabled) return null;
  if (!publicFormDef(link.form_key as string)) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, status")
    .eq("id", link.company_id)
    .maybeSingle();
  if (!company || company.status === "disabled") return null;

  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("company_id", company.id)
    .eq("key", link.form_key)
    .maybeSingle();
  if (!form) return null;

  const { data: version } = await supabase
    .from("form_versions")
    .select("id, schema")
    .eq("form_id", form.id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version || !isFormSchema(version.schema)) return null;

  return {
    companyId: company.id as string,
    companyName: company.name as string,
    formKey: link.form_key as string,
    formVersionId: version.id as string,
    schema: version.schema as FormSchema,
  };
}

/** Every public link this company has created (Admin, Settings). */
export async function listPublicFormLinks(companyId: string): Promise<PublicFormLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_form_links")
    .select("id, form_key, code, enabled, created_at")
    .eq("company_id", companyId);
  return (data ?? []) as PublicFormLink[];
}

type SubmissionRow = {
  id: string;
  form_key: string;
  submitted_name: string | null;
  submitted_email: string;
  status: PublicSubmission["status"];
  person_id: string | null;
  evidence_id: string | null;
  holiday_request_id: string | null;
  handled_at: string | null;
  created_at: string;
  answers: Record<string, unknown> | null;
  people: { full_name: string } | { full_name: string }[] | null;
  branches: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** The submissions queue. RLS decides what the caller can see. */
export async function listPublicSubmissions(companyId: string): Promise<PublicSubmission[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_form_submissions")
    .select(
      "id, form_key, submitted_name, submitted_email, status, person_id, evidence_id, holiday_request_id, handled_at, created_at, answers, people:person_id(full_name), branches:branch_id(name)",
    )
    .eq("company_id", companyId)
    .neq("status", "discarded")
    .order("created_at", { ascending: false })
    .limit(200);

  return ((data ?? []) as SubmissionRow[]).map((r) => ({
    id: r.id,
    form_key: r.form_key,
    submitted_name: r.submitted_name,
    submitted_email: r.submitted_email,
    status: r.status,
    person_id: r.person_id,
    person_name: one(r.people)?.full_name ?? null,
    branch_name: one(r.branches)?.name ?? null,
    evidence_id: r.evidence_id,
    holiday_request_id: r.holiday_request_id,
    start_date: isoOrNull(r.answers?.["start_date_of_holiday"]),
    end_date: isoOrNull(r.answers?.["end_date_of_holiday"]),
    handled_at: r.handled_at,
    created_at: r.created_at,
  }));
}

/** How many submissions are still waiting to be linked (dashboard card). */
export async function getUnmatchedSubmissionCount(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("public_form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "unmatched");
  return count ?? 0;
}

export type PersonOption = { id: string; full_name: string; branch_name: string | null };

/** Active people, for the "link this to" picker. */
export async function listLinkablePeople(companyId: string): Promise<PersonOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name, branches:branch_id(name)")
    .eq("company_id", companyId)
    .neq("employment_status", "leaver")
    .is("archived_at", null)
    .order("full_name");
  return ((data ?? []) as Array<{
    id: string;
    full_name: string;
    branches: { name: string } | { name: string }[] | null;
  }>).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    branch_name: one(p.branches)?.name ?? null,
  }));
}
