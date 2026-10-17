import "server-only";

/**
 * Be Care Compliant: the councils and health boards that fund a company's service users
 * (Rota and Visits Stage 7b, Phil's popups 2026-10-17; docs/decisions/rota-visits.md, Stage 7b
 * decision 7). Kept for every company, set on each service user's Manage record. Cancellation
 * rules follow the funder (Stage 7b decision 6). Read as the caller: RLS shows a company's own.
 */

import { createClient } from "@/lib/supabase/server";

export type Funder = { id: string; name: string; archivedAt: string | null };

/** Every funder of the company, archived ones too, A to Z. */
export async function listFunders(companyId: string): Promise<Funder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("funders")
    .select("id, name, archived_at")
    .eq("company_id", companyId);
  return ((data as { id: string; name: string; archived_at: string | null }[] | null) ?? [])
    .map((f) => ({ id: f.id, name: f.name, archivedAt: f.archived_at }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));
}
