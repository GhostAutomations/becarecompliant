import "server-only";

/**
 * Be Care Compliant — who a briefing goes to, resolved on the SERVER.
 *
 * "Everyone" and "a whole branch" are a choice in the browser and a query here, so the list
 * cannot be tampered with and RLS still decides who is reachable: a Branch Manager's "everyone"
 * is their own branch, by definition. Leavers and archived records are never included.
 *
 * Shared by policies and forms (assignItems) and by memos, messages and attachments
 * (lib/briefings/notice-actions.ts), so the two can never disagree about who "everyone" is.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BriefingScope } from "@/lib/assignments/types";

export type BriefingAudience =
  | { ok: true; scope: BriefingScope; branchId: string | null; personIds: string[] }
  | { ok: false; error: string };

export async function resolveBriefingAudience(
  supabase: SupabaseClient,
  companyId: string,
  input: { scope: unknown; branchId: unknown; personIds: unknown[] },
): Promise<BriefingAudience> {
  const scopeRaw = String(input.scope ?? "people");
  const scope: BriefingScope = scopeRaw === "company" || scopeRaw === "branch" ? scopeRaw : "people";
  const branchId = String(input.branchId ?? "");

  if (scope === "company" || scope === "branch") {
    if (scope === "branch" && !branchId) return { ok: false, error: "Choose a branch." };
    let q = supabase
      .from("people")
      .select("id")
      .eq("company_id", companyId)
      .neq("employment_status", "leaver")
      .is("archived_at", null);
    if (scope === "branch") q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    const personIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (personIds.length === 0) {
      return {
        ok: false,
        error:
          scope === "branch"
            ? "Nobody on the register is in that branch."
            : "There is nobody on your register to send this to.",
      };
    }
    return { ok: true, scope, branchId: scope === "branch" ? branchId : null, personIds };
  }

  const wanted = [...new Set(input.personIds.map(String).filter(Boolean))];
  if (wanted.length === 0) return { ok: false, error: "Choose at least one person." };
  // Chosen by hand still has to be someone this caller can see, employed, in this company.
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .eq("company_id", companyId)
    .neq("employment_status", "leaver")
    .is("archived_at", null)
    .in("id", wanted);
  if (error) return { ok: false, error: error.message };
  const personIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (personIds.length === 0) return { ok: false, error: "Choose at least one person." };
  return { ok: true, scope, branchId: null, personIds };
}
