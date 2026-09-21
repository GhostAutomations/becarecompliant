import "server-only";

/**
 * Be Care Compliant — the names the Incident Report's lookups offer.
 *
 * READ WITH THE SERVICE ROLE, deliberately, and only for this form. Everywhere else a lookup
 * reads through the caller's own session so RLS decides what they may know exists
 * (lib/forms/lookup-data.ts). The incident report is the exception because a carer on the team
 * portal can see neither the service users nor their colleagues, and would be handed two empty
 * boxes. Phil, 2026-09-19: service users "for the branch they select", staff "all staff".
 *
 * What goes to the browser is the least that does the job: a name, the branch name to tell two
 * of the same name apart, and ids. Active records of THIS company only. Every id that comes back
 * is checked again on the server before anything is linked (report-actions.ts).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { LookupChoice } from "@/lib/forms/lookup";

type Row = {
  id: string;
  full_name: string;
  branch_id: string | null;
  branches: { name: string } | { name: string }[] | null;
};

function toChoice(r: Row): LookupChoice {
  const b = Array.isArray(r.branches) ? r.branches[0] : r.branches;
  return {
    id: r.id,
    label: r.full_name,
    hint: b?.name ?? undefined,
    branchId: r.branch_id ?? undefined,
  };
}

export async function incidentReportChoices(
  companyId: string,
): Promise<Partial<Record<string, LookupChoice[]>>> {
  const admin = createServiceClient();
  const [su, people] = await Promise.all([
    admin
      .from("service_users")
      .select("id, full_name, branch_id, branches(name)")
      .eq("company_id", companyId)
      .eq("service_status", "active")
      .order("surname_key", { ascending: true }),
    admin
      .from("people")
      .select("id, full_name, branch_id, branches(name)")
      .eq("company_id", companyId)
      .eq("employment_status", "active")
      .is("archived_at", null)
      .order("surname_key", { ascending: true }),
  ]);
  return {
    service_user: ((su.data as Row[] | null) ?? []).map(toChoice),
    person: ((people.data as Row[] | null) ?? []).map(toChoice),
  };
}

/** The ids that are really this company's: a service user in the branch the report names, and
 *  active staff. Anything else posted is dropped, never linked. */
export async function checkReportLinks(
  companyId: string,
  branchId: string,
  serviceUserId: string | null,
  personIds: string[],
): Promise<{ serviceUserId: string | null; personIds: string[] }> {
  const admin = createServiceClient();
  let su: string | null = null;
  if (serviceUserId) {
    const { data } = await admin
      .from("service_users")
      .select("id")
      .eq("id", serviceUserId)
      .eq("company_id", companyId)
      .eq("branch_id", branchId)
      .maybeSingle();
    su = data ? (data.id as string) : null;
  }
  let people: string[] = [];
  const wanted = Array.from(new Set(personIds.filter(Boolean)));
  if (wanted.length > 0) {
    const { data } = await admin
      .from("people")
      .select("id")
      .eq("company_id", companyId)
      .in("id", wanted);
    const ok = new Set(((data as Array<{ id: string }> | null) ?? []).map((r) => r.id));
    people = wanted.filter((id) => ok.has(id));
  }
  return { serviceUserId: su, personIds: people };
}
