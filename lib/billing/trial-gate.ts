import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { trialState, type TrialState } from "@/lib/billing/trial";
import { companyIsLocked } from "@/lib/companies/deletion";

/**
 * The database half of the trial clock. Kept apart from trial.ts so the maths stays pure
 * and unit tested.
 *
 * WHY React cache(). requireCompany() consults this on every page, every server action and
 * every export route, and several of those run more than once in a single request. cache()
 * dedupes the read per request, so the gate costs one small query per render rather than
 * one per guard call.
 *
 * ONE COLUMN, READABLE BY EVERY MEMBER. It reads companies, never company_billing, whose
 * RLS admits only a Company Admin and the founder. If the gate depended on the subscription
 * row, a Manager would see nothing and be locked out of a company his Admin uses perfectly
 * well. The Stripe webhook clears companies.trial_ends_at when a subscription goes live, so
 * a paying company reads exactly like one that never had a trial.
 */
export const getCompanyTrialState = cache(
  async (
    companyId: string,
  ): Promise<TrialState & { companyName: string; tier: string; companyStatus: string }> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("name, tier, trial_ends_at, status")
      .eq("id", companyId)
      .maybeSingle();
    const row = (data ?? null) as
      | {
          name: string | null;
          tier: string | null;
          trial_ends_at: string | null;
          status: string | null;
        }
      | null;
    const state = trialState({ trialEndsAt: row?.trial_ends_at ?? null, tier: row?.tier });
    return {
      ...state,
      companyName: row?.name ?? "Your company",
      tier: row?.tier ?? "business",
      /* A read that did not answer must never be the reason somebody loses access to their own
         records, so an unreadable row reads as 'active' — the same way isCompanyLapsed treats a
         failed read as "not lapsed". */
      companyStatus: row?.status ?? "active",
    };
  },
);

/** Has this company's trial run out? A read failure returns false: a query that did not
 *  answer must never be the reason somebody loses access to their own records. */
export async function isCompanyLapsed(companyId: string): Promise<boolean> {
  const state = await getCompanyTrialState(companyId);
  return state.status === "expired";
}


/**
 * Is this company shut out of the product — suspended, archived or deleted?
 *
 * THE DEFECT THIS CLOSES, found 2026-08-18 at the start of Operation Thistle: companies.status
 * was written by the founder console, printed on two screens as a pill, and read by NO guard
 * anywhere. "Suspend" moved a word and nothing else; a suspended company's staff carried on
 * signing in and working as though nothing had happened. A control that says it cuts off access
 * and does not is worse than no control, because somebody relies on it.
 *
 * The rule itself is pure and unit tested in lib/companies/deletion.ts.
 */
export async function isCompanyLocked(companyId: string): Promise<boolean> {
  const state = await getCompanyTrialState(companyId);
  return companyIsLocked(state.companyStatus);
}
