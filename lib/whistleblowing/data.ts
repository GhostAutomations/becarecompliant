import "server-only";

/**
 * Be Care Compliant — Whistleblowing server data access (THE LIST item 21, increment 2).
 *
 * Reads go through the RLS-scoped user client. The policies (0174, amended by 0175) admit
 * the platform admin, the Company Admin and the Responsible Individual, and nobody else.
 * A Branch Manager calling any of these gets an empty list, not an error — which is the
 * point: there is nothing here for them to discover.
 */

import { createClient } from "@/lib/supabase/server";
import type { DisclosureRecord } from "./types";

type DisclosureRow = Omit<DisclosureRecord, "branch_name"> & {
  branches: { name: string } | null;
};

const DISCLOSURE_SELECT = "*, branches(name)";

function toDisclosure(row: DisclosureRow): DisclosureRecord {
  const { branches, ...rest } = row;
  return { ...rest, branch_name: branches?.name ?? null };
}

/** Every disclosure the current user may see, most recently received first. */
export async function listDisclosures(companyId: string): Promise<DisclosureRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whistleblowing_disclosures")
    .select(DISCLOSURE_SELECT)
    .eq("company_id", companyId)
    .order("received_on", { ascending: false })
    .order("created_at", { ascending: false });
  return ((data as DisclosureRow[] | null) ?? []).map(toDisclosure);
}

export async function getDisclosure(id: string): Promise<DisclosureRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whistleblowing_disclosures")
    .select(DISCLOSURE_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toDisclosure(data as DisclosureRow) : null;
}

/** Every operational branch in the company.
 *
 *  NOT scoped to the caller's branches, unlike everywhere else: only company-wide roles
 *  reach this module at all, and a disclosure about a branch has to be filable against
 *  that branch whether or not the Responsible Individual is attached to it. */
export async function listCompanyBranches(
  companyId: string,
): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("kind", "branch")
    .eq("status", "active")
    .order("name", { ascending: true });
  return (data as Array<{ id: string; name: string }> | null) ?? [];
}
