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
 * THE DATABASE DECIDES THE DATES (0444, audit F8 and F10). complete_check used to store whatever
 * dates it was sent, with any Evidence or none, so a carer could mark their own Supervision done
 * and due in 2099. It now works the completion date and the next due date out of the Evidence
 * itself, with the same rules as the code below (lib/evidence/completion-date.ts, lib/recurrence.ts,
 * lib/forms/retest.ts), and refuses a form dated in the future or filed on your own record. It
 * also restarts the supervision cycle after an Appraisal and schedules the "after Supervision 3"
 * Appraisal, in the same transaction, which used to be two more calls from here that nobody
 * checked. The dates are still worked out here and sent, so the audit line can say what was
 * meant, but the due date returned is the one the database stored.
 *
 * What stays with the callers: the Evidence itself, closing the Planner booking and the audit
 * line, because those differ in wording and in what they record.
 */

import type { createClient } from "@/lib/supabase/server";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { retestDue, withRetest } from "@/lib/forms/retest";
import { parseCivilDate } from "@/lib/recurrence";
import type { CheckDefinition } from "./types";
import { nextDueAfterCompletion } from "./logic";

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

  /* WHAT WAS STORED, for the audit line. Read through the caller's own session: a booked
     conductor stops seeing the Check once complete_check has closed their booking, and then the
     date worked out above is what is reported, which the database works out the same way. */
  const { data: stored } = await supabase
    .from("check_instances")
    .select("due_date")
    .eq("id", opts.instanceId)
    .maybeSingle();
  return { ok: true, nextDue: stored ? ((stored.due_date as string | null) ?? null) : nextDue };
}
