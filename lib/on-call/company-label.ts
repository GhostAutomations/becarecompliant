import "server-only";
import { createClient } from "@/lib/supabase/server";
import { onCallLabel } from "@/lib/on-call/label";

/**
 * What THIS company calls the On Call department (migration 0276).
 *
 * One helper rather than five copies of the same select: the label has to agree across the nav,
 * four page titles and a dashboard line, and a department that is called two different things on
 * two screens is worse than one that is called the wrong thing consistently.
 */
export async function getOnCallLabel(companyId: string | null | undefined): Promise<string> {
  if (!companyId) return onCallLabel(null);
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("on_call_label")
    .eq("id", companyId)
    .maybeSingle();
  return onCallLabel((data as { on_call_label?: string | null } | null)?.on_call_label);
}
