import "server-only";

/**
 * Be Care Compliant — Regulation 80 review reads (RLS scoped).
 * The eligible signatory list is shared with Reg 73 (branch manager and above), so it
 * is imported from lib/reg73/data rather than duplicated.
 */

import { createClient } from "@/lib/supabase/server";

export type Reg80ReviewRow = {
  id: string;
  branch_id: string;
  reference: string | null;
  ri_name: string | null;
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "submitted";
  submitted_at: string | null;
  updated_at: string;
};

export type Reg80ReviewFull = Reg80ReviewRow & {
  company_id: string;
  data: Record<string, unknown>;
  prefill: Record<string, unknown>;
  signature_path: string | null;
};

export async function listReg80Reviews(companyId: string, branchId: string): Promise<Reg80ReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reg80_reviews")
    .select("id, branch_id, reference, ri_name, period_start, period_end, status, submitted_at, updated_at")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("updated_at", { ascending: false });
  return (data as Reg80ReviewRow[] | null) ?? [];
}

export type Reg80ReviewListItem = Reg80ReviewRow & { branch_name: string };

/** All reviews the caller can see, optionally limited to given branches (managers). */
export async function listReg80ReviewsForBranches(
  companyId: string,
  branchIds: string[] | null,
): Promise<Reg80ReviewListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("reg80_reviews")
    .select(
      "id, branch_id, reference, ri_name, period_start, period_end, status, submitted_at, updated_at, branches(name)",
    )
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (branchIds) q = q.in("branch_id", branchIds);
  const { data } = await q;
  return ((data as unknown as (Reg80ReviewRow & { branches: { name: string } | { name: string }[] | null })[] | null) ?? []).map(
    (r) => ({
      ...r,
      branch_name: Array.isArray(r.branches) ? r.branches[0]?.name ?? "" : r.branches?.name ?? "",
    }),
  );
}

export async function getReg80Review(id: string): Promise<Reg80ReviewFull | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reg80_reviews")
    .select(
      "id, company_id, branch_id, reference, ri_name, period_start, period_end, status, submitted_at, updated_at, data, prefill, signature_path",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as Reg80ReviewFull | null) ?? null;
}
