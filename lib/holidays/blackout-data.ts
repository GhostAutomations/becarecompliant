import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Blackout } from "@/lib/holidays/blackouts";

/**
 * Holiday blackout dates (0477, Phil 2026-10-15; docs/decisions/holiday-blackouts.md).
 */

/** The blackouts this login may see (RLS: their branches, "All branches" ones, everything for a
 *  company wide role), soonest first. */
export async function listBlackouts(companyId: string): Promise<Blackout[]> {
  const supabase = await createClient();
  const [{ data: rows }, { data: links }] = await Promise.all([
    supabase.from("holiday_blackouts").select("id, start_date, end_date, reason, all_branches").eq("company_id", companyId).order("start_date"),
    supabase.from("holiday_blackout_branches").select("blackout_id, branch_id").eq("company_id", companyId),
  ]);
  const byBlackout = new Map<string, string[]>();
  for (const l of (links ?? []) as Array<{ blackout_id: string; branch_id: string }>) {
    byBlackout.set(l.blackout_id, [...(byBlackout.get(l.blackout_id) ?? []), l.branch_id]);
  }
  return ((rows ?? []) as Array<{ id: string; start_date: string; end_date: string; reason: string; all_branches: boolean }>).map((r) => ({
    id: r.id,
    start: r.start_date,
    end: r.end_date,
    reason: r.reason,
    allBranches: r.all_branches,
    branchIds: byBlackout.get(r.id) ?? [],
  }));
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/**
 * THE SAME CHECK THE DATABASE MAKES, asked BEFORE anything is saved. A booking stores its form as
 * Evidence first; a refusal only at the holiday row would leave that form behind. Returns the
 * refusal in the database's own words, or null when the dates are clear. If the check itself
 * cannot be made, nothing is saved.
 */
export async function blackoutRefusal(
  supabase: RpcClient,
  companyId: string,
  branchId: string | null,
  start: string,
  end: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("holiday_blackout_check", {
    p_company: companyId,
    p_branch: branchId,
    p_start: start,
    p_end: end,
  });
  if (error) return `The blackout dates could not be checked, so nothing was saved: ${error.message}`;
  return typeof data === "string" && data ? data : null;
}

/** The roles that may "Book anyway" inside a blackout (rule 5). */
export function canOverrideBlackout(role: string): boolean {
  return ["company_admin", "registered_individual", "registered_manager", "platform_admin"].includes(role);
}

/** "Book anyway" and its reason from a form: the reason, or null when not ticked. */
export function overrideFrom(formData: FormData): { ticked: boolean; reason: string | null } {
  const ticked = formData.get("book_anyway") === "1";
  const reason = String(formData.get("blackout_override_reason") ?? "").trim();
  return { ticked, reason: ticked && reason ? reason.slice(0, 300) : null };
}

/** A database refusal that IS a blackout, in its own words; otherwise null. */
export function blackoutWords(message: string | null | undefined): string | null {
  if (!message) return null;
  const i = message.indexOf("Holidays can't be booked");
  return i >= 0 ? message.slice(i) : null;
}
