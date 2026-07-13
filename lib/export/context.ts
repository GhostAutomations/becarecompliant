import "server-only";

/**
 * Be Care Compliant — export scope resolution (Phase 8).
 * Resolve a company name and an optional branch (validated to belong to the
 * company, through the caller's RLS client) for a report. A branch value of
 * "all" or an unknown branch means the whole company.
 */

import { createClient } from "@/lib/supabase/server";

export type ReportScope = {
  companyName: string;
  branchId: string | null;
  branchName: string | null;
};

export async function resolveReportScope(
  companyId: string,
  branchParam: string | null,
): Promise<ReportScope> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle<{ name: string }>();

  let branchId: string | null = null;
  let branchName: string | null = null;
  if (branchParam && branchParam !== "all") {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, name")
      .eq("id", branchParam)
      .eq("company_id", companyId)
      .maybeSingle<{ id: string; name: string }>();
    if (branch) {
      branchId = branch.id;
      branchName = branch.name;
    }
  }

  return { companyName: company?.name ?? "Company", branchId, branchName };
}
