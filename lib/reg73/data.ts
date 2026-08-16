import "server-only";

/**
 * Be Care Compliant — Regulation 73 visit reads (RLS scoped).
 */

import { createClient } from "@/lib/supabase/server";
import { listStaff } from "@/lib/auth/company-profiles";

export type Reg73VisitRow = {
  id: string;
  branch_id: string;
  reference: string | null;
  ri_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "submitted";
  submitted_at: string | null;
  updated_at: string;
};

export type Reg73VisitFull = Reg73VisitRow & {
  company_id: string;
  data: Record<string, unknown>;
  prefill: Record<string, unknown>;
  signature_path: string | null;
};

export async function listReg73Visits(companyId: string, branchId: string): Promise<Reg73VisitRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reg73_visits")
    .select("id, branch_id, reference, ri_name, start_date, end_date, status, submitted_at, updated_at")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("updated_at", { ascending: false });
  return (data as Reg73VisitRow[] | null) ?? [];
}

/** People eligible to undertake an RI branch visit: branch manager and above. */
export async function listReg73Signatories(companyId: string): Promise<string[]> {
  // Definer path: read directly, the only roles allowed to edit these reports (RI and RM) saw
  // nobody but themselves in the dropdown.
  const staff = await listStaff({
    companyId,
    roles: ["manager", "registered_manager", "registered_individual", "company_admin"],
  });
  /*
   * The chosen STRING is stored as ri_name and printed on the submitted Reg 73 report, so this
   * is not a picker label that can be tidied up later. It briefly excluded anybody whose display
   * name had fallen back to their email address, to keep an inbox off a regulatory document.
   * profiles_full_name_not_blank (0201) removes the need: a profile with no name can no longer
   * exist, so nobody is silently missing from this list.
   */
  return Array.from(new Set(staff.map((p) => p.name).filter(Boolean)));
}

export type Reg73VisitListItem = Reg73VisitRow & { branch_name: string };

/** All visits the caller can see, optionally limited to given branches (managers). */
export async function listReg73VisitsForBranches(
  companyId: string,
  branchIds: string[] | null,
): Promise<Reg73VisitListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("reg73_visits")
    .select("id, branch_id, reference, ri_name, start_date, end_date, status, submitted_at, updated_at, branches(name)")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (branchIds) q = q.in("branch_id", branchIds);
  const { data } = await q;
  return ((data as unknown as (Reg73VisitRow & { branches: { name: string } | { name: string }[] | null })[] | null) ?? []).map(
    (r) => ({
      ...r,
      branch_name: Array.isArray(r.branches) ? r.branches[0]?.name ?? "" : r.branches?.name ?? "",
    }),
  );
}

export async function getReg73Visit(id: string): Promise<Reg73VisitFull | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reg73_visits")
    .select(
      "id, company_id, branch_id, reference, ri_name, start_date, end_date, status, submitted_at, updated_at, data, prefill, signature_path",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as Reg73VisitFull | null) ?? null;
}
