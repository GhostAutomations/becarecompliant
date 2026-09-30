import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { branchTerms, branchWord, type BranchTerms } from "@/lib/branches/word";

/**
 * What THIS company calls a branch (migration 0354), for server components, routes and exports.
 * One read per request (React cache), the same way getOnCallLabel keeps one name everywhere.
 */
export const getBranchTerms = cache(async (companyId: string | null | undefined): Promise<BranchTerms> => {
  if (!companyId) return branchTerms(null);
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("branch_word, branch_word_plural")
    .eq("id", companyId)
    .maybeSingle();
  return branchTerms(branchWord(data as { branch_word?: string | null; branch_word_plural?: string | null } | null));
});
