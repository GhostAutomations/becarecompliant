import "server-only";

/**
 * Be Care Compliant — moving a People Check on once its Evidence is filed.
 *
 * ONE RULE FOR TWO DOORS (DEF-056, 2026-09-23). A Check is completed either by filling in its
 * Form in the app or, since today, by an Admin uploading the paper copy of a Form done by hand
 * (Phil: "if anything ever has to be completed on paper and can be uploaded as evidence"). Both
 * must schedule the next one identically: the same recurrence, the same supervision cycle, the
 * same "after Supervision 3" appraisal. So the scheduling lives here, once, and completeCheck
 * and the paper upload both call it. A copy in each would drift the first time either changed.
 *
 * What stays with the callers: the Evidence itself, closing the Planner booking and the audit
 * line, because those differ in wording and in what they record.
 */

import type { createClient } from "@/lib/supabase/server";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { retestDue, withRetest } from "@/lib/forms/retest";
import { parseCivilDate } from "@/lib/recurrence";
import type { CheckDefinition } from "./types";
import { nextDueAfterCompletion, addDaysIso } from "./logic";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function advancePersonCheck(opts: {
  supabase: Supabase;
  instanceId: string;
  personId: string;
  companyId: string;
  def: CheckDefinition;
  /** The published schema the Check's Form uses, for the retest rule. Null skips it. */
  schema: FormSchema | null;
  answers: Answers;
  completedOnIso: string;
  evidenceId: string;
}): Promise<{ ok: true; nextDue: string | null } | { ok: false; error: string }> {
  const { supabase, def, answers, completedOnIso } = opts;

  // Next due computed by the shared recurrence engine. For an "after Supervision 3"
  // appraisal, the interval comes from the Supervision box.
  const { data: supDef } = await supabase
    .from("check_definitions")
    .select("interval")
    .eq("company_id", opts.companyId)
    .eq("population", "people")
    .eq("key", "supervision")
    .maybeSingle();
  const supInterval = (supDef?.interval as number | null) ?? 90;
  const advanced = nextDueAfterCompletion(def, answers, supInterval, parseCivilDate(completedOnIso));
  /* A FAILED SPOT CHECK IS DUE AGAIN IN A WEEK (Phil, 2026-09-19): the form says so on the
     question (retestWithin), and the sooner date wins. */
  const nextDue = withRetest(
    advanced.nextDue,
    opts.schema ? retestDue(opts.schema, answers, completedOnIso) : null,
  );
  const { error: advanceErr } = await supabase.rpc("complete_check", {
    p_instance_id: opts.instanceId,
    p_completed_on: completedOnIso,
    p_evidence_id: opts.evidenceId,
    p_next_due: nextDue,
    p_expiry_date: advanced.expiry,
  });
  if (advanceErr) {
    return { ok: false, error: `Evidence was saved, but the check could not be advanced: ${advanceErr.message}` };
  }

  // Completing an Annual Appraisal restarts the supervision cycle: re-anchor the
  // supervision check so its RAG reflects the new cycle (Sup 1 due = appraisal
  // completion + supervision interval, none completed yet). The display slots use
  // the same anchor (supervisionCycleAnchor), so screen and RAG stay in step.
  if (def.key === "appraisal") {
    const supDue = addDaysIso(completedOnIso, supInterval);
    if (supDue) {
      await supabase.rpc("reanchor_supervision_cycle", {
        p_person_id: opts.personId,
        p_due_date: supDue,
      });
    }
  }

  // Completing Supervision 3 schedules an "After Supervision 3" appraisal: due one
  // supervision interval after the Sup 3 completion, keeping the cycle on cadence.
  if (def.key === "supervision" && String(answers.supervision_type ?? "") === "3") {
    const { data: apprDef } = await supabase
      .from("check_definitions")
      .select("schedule_mode")
      .eq("company_id", opts.companyId)
      .eq("population", "people")
      .eq("key", "appraisal")
      .eq("active", true)
      .maybeSingle();
    if ((apprDef?.schedule_mode as string | null) === "after_sup3") {
      const apprDue = addDaysIso(completedOnIso, supInterval);
      if (apprDue) {
        await supabase.rpc("set_person_check_due", {
          p_person_id: opts.personId,
          p_check_key: "appraisal",
          p_due_date: apprDue,
        });
      }
    }
  }

  return { ok: true, nextDue };
}
