import "server-only";

/**
 * Be Care Compliant — the records a record_lookup field may offer.
 *
 * READ THROUGH THE CALLER'S OWN CLIENT, deliberately. RLS decides which records this
 * user may see (a Supervisor sees their caseload, a Manager their branches), so the
 * list a form offers is exactly the list that user is allowed to know exists. Handing
 * the renderer a service-role list would leak the names of records they cannot open.
 *
 * The branch rides along as the hint, because two service users called John Smith is
 * the case the field has to survive.
 */

import { createClient } from "@/lib/supabase/server";
import type { LookupChoice } from "./lookup";

type Row = {
  id: string;
  full_name: string;
  branches: { name: string } | { name: string }[] | null;
};

function branchName(row: Row): string | undefined {
  const b = row.branches;
  if (!b) return undefined;
  const one = Array.isArray(b) ? b[0] : b;
  return one?.name ?? undefined;
}

/** Active Service Users this caller may see, newest naming rules applied by the view. */
export async function serviceUserChoices(companyId: string): Promise<LookupChoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("id, full_name, branches(name)")
    .eq("company_id", companyId)
    .eq("service_status", "active")
    .order("surname_key", { ascending: true });
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    label: r.full_name,
    hint: branchName(r),
  }));
}

/** Active people (carers) this caller may see. */
export async function personChoices(companyId: string): Promise<LookupChoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name, branches(name)")
    .eq("company_id", companyId)
    .eq("employment_status", "active")
    .is("archived_at", null)
    .order("surname_key", { ascending: true });
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    label: r.full_name,
    hint: branchName(r),
  }));
}

/**
 * The choices a schema actually needs, so a form with no lookup field costs no query.
 * Returned keyed by source, which is the shape FormRenderer's `lookupChoices` takes.
 */
export async function choicesForSchema(
  companyId: string,
  schema: { sections: Array<{ fields: Array<{ type: string; lookup?: string }> }> },
): Promise<Partial<Record<string, LookupChoice[]>> | undefined> {
  const sources = new Set<string>();
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.type === "record_lookup") sources.add(field.lookup ?? "service_user");
    }
  }
  if (sources.size === 0) return undefined;
  const out: Partial<Record<string, LookupChoice[]>> = {};
  if (sources.has("service_user")) out.service_user = await serviceUserChoices(companyId);
  if (sources.has("person")) out.person = await personChoices(companyId);
  return out;
}
