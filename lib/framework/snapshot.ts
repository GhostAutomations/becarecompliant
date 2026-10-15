import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Store today's readiness score per requirement (once per London day) so the trend builds. The
 * unique key and ignoreDuplicates make it safe on every open: the first open of the day is kept.
 * Written as the signed in user, so the database's own rules (0444) decide what may be stored.
 *
 * Shared by captureReadinessSnapshot (the old client fired action) and the Readiness page, which
 * since the speed plan (2026-10-15, docs/decisions/speed-plan.md) stores the scores it has just
 * worked out after the page is sent, instead of the browser posting back for a second full
 * readiness calculation.
 */
export async function storeReadinessSnapshot(
  supabase: SupabaseClient,
  companyId: string,
  regulator: "cqc" | "ciw",
  branchId: string | null,
  requirements: Array<{ code: string; score: number | null }>,
): Promise<void> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const rows = requirements
    .filter((r) => r.score != null)
    .map((r) => ({ company_id: companyId, regulator, branch_id: branchId, requirement_code: r.code, score: r.score, captured_on: today }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("framework_readiness_snapshots")
    .upsert(rows, { onConflict: "company_id,regulator,branch_id,requirement_code,captured_on", ignoreDuplicates: true });
  /* Nobody is waiting on this, so a refusal, such as a page opened just before midnight and stored
     just after, is logged rather than shown. */
  if (error) console.error("[readiness] snapshot not stored:", error.code, error.message);
}

/**
 * A client for work done after the response has gone (next/server `after`), where the request's
 * cookies can no longer be read: built from the cookies read while the page was rendering, so it
 * is still the same signed in user.
 */
export function clientFromCookies(jar: Array<{ name: string; value: string }>): SupabaseClient {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return jar;
      },
      setAll() {
        // After the response: nothing to set.
      },
    },
  }) as unknown as SupabaseClient;
}
