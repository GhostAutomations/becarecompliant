import "server-only";

/**
 * Be Care Compliant — moving a Service User Check on once its Evidence is filed.
 *
 * ONE RULE FOR TWO DOORS (DEF-056, 2026-09-23): the in app Form and the paper upload an Admin
 * makes for a Form done by hand both call this, so a Care Plan Review scheduled from a paper
 * copy lands on exactly the date one filled in on screen would, Complex cadence included.
 * See lib/people/advance-check.ts for the People half.
 */

import type { createClient } from "@/lib/supabase/server";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { retestDue, withRetest } from "@/lib/forms/retest";
import { parseCivilDate } from "@/lib/recurrence";
import type { CheckDefinition } from "@/lib/people/types";
import { nextDueAfterCompletion } from "@/lib/people/logic";
import { addDaysToIso } from "./logic";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The branch Service User type + company Complex review interval, so care plan
 *  reviews on a Complex branch schedule at the Complex cadence (default 80 days). */
export async function complexReviewContext(
  supabase: Supabase,
  companyId: string,
  branchId: string,
): Promise<{ isComplex: boolean; intervalDays: number }> {
  const [{ data: branch }, { data: def }] = await Promise.all([
    supabase.from("branches").select("service_user_type").eq("id", branchId).maybeSingle(),
    supabase
      .from("check_definitions")
      .select("interval")
      .eq("company_id", companyId)
      .eq("population", "service_users")
      .eq("key", "care_plan_review")
      .maybeSingle(),
  ]);
  const days = def?.interval as number | null;
  return {
    isComplex: (branch?.service_user_type as string | null) === "complex",
    /* ONE cadence for both views (Phil, 2026-09-04): the Care Plan Review's own. */
    intervalDays: typeof days === "number" && days >= 1 ? days : 90,
  };
}

/** The next due date a completion on this date gives, without writing anything. */
export async function serviceUserNextDue(opts: {
  supabase: Supabase;
  companyId: string;
  branchId: string | null;
  def: CheckDefinition;
  schema: FormSchema | null;
  answers: Answers;
  completedOnIso: string;
}): Promise<{ nextDue: string | null; expiry: string | null }> {
  const { def, answers, completedOnIso } = opts;
  const advance = nextDueAfterCompletion(def, answers, null, parseCivilDate(completedOnIso));
  let nextDue = advance.nextDue;
  // On a Complex branch, the Care Plan Review advances at the Complex cadence (default
  // 80 days), so the next REV slot / rollup RAG is scheduled correctly.
  if (def.key === "care_plan_review") {
    const ctx = await complexReviewContext(opts.supabase, opts.companyId, opts.branchId ?? "");
    if (ctx.isComplex) nextDue = addDaysToIso(completedOnIso, ctx.intervalDays);
  }
  // An answer that calls for a sooner retest wins (lib/forms/retest.ts).
  nextDue = withRetest(nextDue, opts.schema ? retestDue(opts.schema, answers, completedOnIso) : null);
  return { nextDue, expiry: advance.expiry };
}

/** Stamp the completion, set the next due date, and clear a booked review it fulfils. */
export async function advanceServiceUserCheck(opts: {
  supabase: Supabase;
  instanceId: string;
  serviceUserId: string;
  def: CheckDefinition;
  completedOnIso: string;
  evidenceId: string;
  nextDue: string | null;
  expiry: string | null;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = opts;
  const { error: advanceErr } = await supabase.rpc("complete_check", {
    p_instance_id: opts.instanceId,
    p_completed_on: opts.completedOnIso,
    p_evidence_id: opts.evidenceId,
    p_next_due: opts.nextDue,
    p_expiry_date: opts.expiry,
  });
  if (advanceErr) {
    return { ok: false, error: `Evidence was saved, but the check could not be advanced: ${advanceErr.message}` };
  }

  // Completing the Care Plan Review fulfils any booking, so clear the Planned Review
  // Date; Review Status then derives from the new New Review Due date.
  if (opts.def.key === "care_plan_review") {
    await supabase
      .from("service_user_trackers")
      .update({
        planned_review_date: null,
        planned_reviewer_id: null,
        planned_review_booked_at: null,
        updated_by: opts.actorId,
      })
      .eq("service_user_id", opts.serviceUserId);
  }
  return { ok: true };
}
