import "server-only";

/**
 * The branches the SIGNED IN user is assigned to, read from user_branches.
 *
 * The companion to lib/auth/manage-scope.ts: the pure function decides, this fetches the one
 * fact it needs. Read through the ordinary client, so it is the caller's own row set; a company
 * wide role has no user_branches rows and does not need any, because canManageRecord never
 * looks at branches for those roles.
 */

import { createClient } from "@/lib/supabase/server";

export async function callerBranchIds(profileId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_branches").select("branch_id").eq("user_id", profileId);
  return (data ?? []).map((r) => r.branch_id as string).filter(Boolean);
}
