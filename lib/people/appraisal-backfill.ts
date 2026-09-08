import "server-only";

/**
 * Be Care Compliant — putting the Annual Appraisal's due date where the rest of the
 * product can see it.
 *
 * WHY (Phil, 2026-09-08). In appraisal mode the appraisal falls due a supervision
 * interval after the third supervision of the cycle. That date was only ever WRITTEN at
 * the moment Sup 3 was completed, and only if the appraisal was already set to "after
 * supervision 3" (see completeCheck). Turn the setting on afterwards -- on a company that
 * has been running for months, with supervisions already done -- and every one of those
 * people keeps an empty appraisal due date forever.
 *
 * The register and the record card DERIVE the date, so they showed it correctly. Nothing
 * that reads the stored date did: the dashboard rollup, the RAG counts, reports, exports
 * and the planner all believed no appraisal was scheduled. Changing the setting now
 * backfills, so the stored date agrees with what the two screens have been showing.
 *
 * The rule is not restated here. appraisalSlot is the one that decides when an appraisal
 * is due, the register draws its column from it and the record card its tile, and this
 * writes down what it says. A backfill that computed the date its own way would be a
 * fourth opinion, and the whole point is that there is one.
 *
 * SAFE TO RUN AGAIN. reschedule_check_instances only touches instances with no completion
 * against them, and rows whose stored date already matches are not sent at all, so
 * re-saving the setting is a no-op rather than a rewrite.
 */

import { createClient } from "@/lib/supabase/server";
import { listRegister } from "./data";
import { appraisalSlot } from "./logic";
import { DEFAULT_AMBER_DAYS } from "@/lib/recurrence";

/**
 * Recompute and store the appraisal due date for every active person in a company.
 * Returns how many instances were changed. Does nothing unless the company's appraisal
 * check is actually on "after supervision 3".
 */
export async function backfillAppraisalDueDates(companyId: string): Promise<number> {
  const { definitions, rows } = await listRegister(companyId, null, "all");

  const appraisalDef = definitions.find((d) => d.key === "appraisal");
  if (!appraisalDef || appraisalDef.schedule_mode !== "after_sup3") return 0;

  const supDef = definitions.find((d) => d.key === "supervision");
  const supInterval = supDef?.interval ?? 90;
  const supAmber = supDef?.amber_days ?? DEFAULT_AMBER_DAYS;

  const supabase = await createClient();
  const { data: instances } = await supabase
    .from("check_instances")
    .select("id, person_id, due_date")
    .eq("definition_id", appraisalDef.id)
    .is("last_completed_on", null);

  const byPerson = new Map<string, { id: string; due_date: string | null }>();
  for (const i of ((instances as Array<{ id: string; person_id: string; due_date: string | null }>) ?? [])) {
    byPerson.set(i.person_id, { id: i.id, due_date: i.due_date });
  }

  const changes: Array<{ instance_id: string; due_date: string | null }> = [];
  for (const row of rows) {
    const instance = byPerson.get(row.person.id);
    if (!instance) continue;
    const slot = appraisalSlot(row.appraisalCompDates, row.supCompDates, supInterval, supAmber);
    // Only what actually differs, so re-saving the setting writes nothing.
    if ((slot.nextDue ?? null) !== (instance.due_date ?? null)) {
      changes.push({ instance_id: instance.id, due_date: slot.nextDue });
    }
  }

  if (changes.length === 0) return 0;

  const { data } = await supabase.rpc("reschedule_check_instances", {
    p_definition_id: appraisalDef.id,
    p_rows: changes,
  });
  return typeof data === "number" ? data : changes.length;
}
