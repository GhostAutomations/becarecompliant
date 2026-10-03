import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Be Care Compliant — the company row, read ONCE per request (audit B1, 3 Oct 2026).
 *
 * THE COST. Every page render read the same companies row again and again, each helper asking
 * for one column of its own: the nav's name and theme, five tier checks for the menu, the
 * branch word, the On Call label, the agreement gate, the regulator, the probation period, the
 * column labels. The Supabase logs for 2 Oct showed nine to ten separate reads of one row on
 * every dashboard render, and each read pays the per row RLS lookups the speed pass is about.
 *
 * THE FIX. One select of the whole row, through the caller's own RLS client, shared by every
 * helper for the rest of the request (React cache is scoped to one request, so a change made
 * by an action is seen by the next render, never by a later visitor). A row the caller may not
 * read comes back null, exactly as each helper's own maybeSingle() did.
 */
export type CompanyRow = {
  id: string;
  name: string | null;
  tier: string | null;
  status: string | null;
  regulator: string | null;
  framework_enabled: boolean | null;
  ui_theme: string | null;
  on_call_label: string | null;
  branch_word: string | null;
  branch_word_plural: string | null;
  agreement_required: boolean | null;
  probation_period_value: number | null;
  probation_period_unit: string | null;
  people_column_labels: Record<string, string> | null;
  service_user_column_labels: Record<string, string> | null;
  supervision_cycle_mode: string | null;
  outcomes_review_months: number | null;
  amber_days_default: number | null;
  trial_ends_at: string | null;
  [key: string]: unknown;
};

export const getCompanyRow = cache(async (companyId: string | null | undefined): Promise<CompanyRow | null> => {
  if (!companyId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (error) {
    console.error("[company-row] read failed:", error.message);
    return null;
  }
  return (data as CompanyRow | null) ?? null;
});
