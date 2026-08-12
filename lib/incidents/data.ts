import "server-only";

/**
 * Be Care Compliant — Incidents & Safeguarding server data access (THE LIST item 21).
 *
 * Every read goes through the RLS-scoped user client, so a Branch Manager sees their
 * own branches and an Admin sees the company. Nothing here re-implements that scoping
 * in TypeScript: the policies in migration 0174 are the guard, and a page that forgets
 * a filter still cannot leak another branch's incidents.
 */

import { createClient } from "@/lib/supabase/server";
import type { IncidentRecord } from "./types";

export { listAccessibleBranchTypes } from "@/lib/service-users/data";

type IncidentRow = Omit<IncidentRecord, "branch_name" | "service_user_name" | "person_name"> & {
  branches: { name: string } | null;
  service_users: { full_name: string } | null;
  people: { full_name: string } | null;
};

const INCIDENT_SELECT =
  "*, branches(name), service_users:service_user_id(full_name), people:person_id(full_name)";

function toIncident(row: IncidentRow): IncidentRecord {
  const { branches, service_users, people, ...rest } = row;
  return {
    ...rest,
    branch_name: branches?.name ?? null,
    service_user_name: service_users?.full_name ?? null,
    person_name: people?.full_name ?? null,
  };
}

/** The Incidents register: every incident the current user may see, most recent
 *  occurrence first. Loaded once; the client filters by status, branch and category. */
export async function listIncidents(companyId: string): Promise<IncidentRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("incidents")
    .select(INCIDENT_SELECT)
    .eq("company_id", companyId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  return ((data as IncidentRow[] | null) ?? []).map(toIncident);
}

export async function getIncident(id: string): Promise<IncidentRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("incidents").select(INCIDENT_SELECT).eq("id", id).maybeSingle();
  return data ? toIncident(data as IncidentRow) : null;
}

/** Active service users the user may see, for the optional "who it happened to"
 *  dropdown. Carries branch_id so the form can narrow to the chosen branch. */
export async function listServiceUsersLite(
  companyId: string,
): Promise<Array<{ id: string; full_name: string; branch_id: string | null }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("id, full_name, branch_id")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  return (data as Array<{ id: string; full_name: string; branch_id: string | null }> | null) ?? [];
}

/** Staff the user may see, for the optional "staff member involved" dropdown.
 *  Leavers are included: an incident is often logged after someone has left, and
 *  the record must still name the right person. */
export async function listPeopleLite(
  companyId: string,
): Promise<Array<{ id: string; full_name: string; branch_id: string | null }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name, branch_id")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  return (data as Array<{ id: string; full_name: string; branch_id: string | null }> | null) ?? [];
}
