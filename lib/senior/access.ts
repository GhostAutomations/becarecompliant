import "server-only";

/**
 * Be Care Compliant: what a Senior may read on the one Check they are completing (0339).
 *
 * A Senior's own client cannot read the people or service_users rows, the tracker, the care plan
 * or anybody else's Evidence, and that is deliberate: their lists come from senior_register,
 * names and statuses only. Completing a Check still needs some of that on the server (the name
 * and branch to prefill, the supervision history to say which supervision it is, the care plan a
 * review shows), so the page asks the database first, senior_may_do_instance, and only on a yes
 * is it handed a service reader for that page. The reader never leaves the server, and what the
 * page sends to the browser is the same as it sends a Manager: the form and its prefilled answers.
 *
 * Returns null for anyone who is not a Senior (they read through RLS as before) and for a Senior
 * the database refuses (the caller sends them back to their list).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function seniorMayDo(instanceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("senior_may_do_instance", { p_instance_id: instanceId });
  return !error && data === true;
}

export async function seniorReaderFor(instanceId: string): Promise<SupabaseClient | null> {
  if (!(await seniorMayDo(instanceId))) return null;
  return createServiceClient();
}
