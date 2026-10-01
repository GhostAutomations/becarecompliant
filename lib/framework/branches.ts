import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Readiness is per registered service (0363, Phil 2026-10-01): CIW inspects and rates each service
 * on its own, so Thistle's Cardiff and Gwent are two reports. A branch counts when it is active and
 * "Registered with the regulator as its own service" (branches.registered_service; the office is
 * off by default). Read through the caller's RLS.
 */
export type ReadinessBranch = { id: string; name: string };

export async function getRegisteredBranches(companyId: string): Promise<ReadinessBranch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("registered_service", true)
    .order("name", { ascending: true });
  const all = (data as ReadinessBranch[] | null) ?? [];
  /* Only the branches this person can see into: a Branch Manager of Cardiff would otherwise be
     offered Newport and shown an empty picture of it (RLS hides its records, not its name).
     is_branch_member is true for company wide roles and the founder, so they get every one. */
  const allowed = await Promise.all(
    all.map(async (b) => {
      const { data: ok } = await supabase.rpc("is_branch_member", { bid: b.id });
      return ok === true;
    }),
  );
  return all.filter((_, i) => allowed[i]);
}

/** The branch a readiness view is for: the one asked for if it is a registered service of this
 *  company, else the first. Null only when the company has no registered service at all, in which
 *  case readiness falls back to every branch together. */
export async function resolveReadinessBranch(
  companyId: string,
  requested: string | null | undefined,
): Promise<{ branch: ReadinessBranch | null; branches: ReadinessBranch[] }> {
  const branches = await getRegisteredBranches(companyId);
  const branch = branches.find((b) => b.id === requested) ?? branches[0] ?? null;
  return { branch, branches };
}

export type BranchInspection = {
  id: string;
  branchId: string;
  inspectedOn: string;
  publishedOn: string | null;
  ratings: Record<string, string>;
  notes: string | null;
};

/** Each branch's most recent recorded inspection (by date inspected). */
export async function getLatestInspections(companyId: string, regulator: "ciw" | "cqc"): Promise<Map<string, BranchInspection>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branch_inspections")
    .select("id, branch_id, inspected_on, published_on, ratings, notes")
    .eq("company_id", companyId)
    .eq("regulator", regulator)
    .order("inspected_on", { ascending: false })
    .order("created_at", { ascending: false });
  const out = new Map<string, BranchInspection>();
  for (const r of (data as Array<{ id: string; branch_id: string; inspected_on: string; published_on: string | null; ratings: Record<string, string> | null; notes: string | null }> | null) ?? []) {
    if (out.has(r.branch_id)) continue;
    out.set(r.branch_id, {
      id: r.id,
      branchId: r.branch_id,
      inspectedOn: r.inspected_on,
      publishedOn: r.published_on,
      ratings: r.ratings ?? {},
      notes: r.notes,
    });
  }
  return out;
}
