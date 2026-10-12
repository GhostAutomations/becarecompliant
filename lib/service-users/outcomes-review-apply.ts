import "server-only";

/**
 * Be Care Compliant: what a completed Individual Plan Review does to the Outcomes page
 * (Phil, 2026-10-05). The form's Outcomes section is lib/service-users/outcomes-review.ts.
 *
 * Runs AFTER the Evidence is stored, with the service client: the Evidence pipeline has
 * already decided this person may complete this record's review, and a Senior or Supervisor
 * who may complete it would otherwise be refused by the outcomes tables' Manager-only RLS
 * and lose the update silently. Every write is pinned to this record's company and service
 * user, and to outcomes that are on it now, so nothing in the answers can reach another one.
 *
 * SAFE TO RUN TWICE. Each update carries the Evidence it came from and the new outcome
 * carries it too, both under unique indexes (0393), so a resubmitted review cannot log the
 * same update or create the same outcome a second time.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOutcomesReview, settingNew, type OutcomesReviewValue } from "./outcomes-review";
import { middayOf, outcomeFrom, pastUpdateIsLatest, type TimelineUpdate } from "./outcome-history";

export type RecordOutcome = { id: string; title: string; target: string | null };

/** The outcomes a review asks about: on the record, not archived, not yet achieved. */
export async function outcomesForReview(serviceUserId: string, client?: SupabaseClient): Promise<RecordOutcome[]> {
  const db = client ?? createServiceClient();
  const { data } = await db
    .from("service_user_outcomes")
    .select("id, title, statement, target_date, position")
    .eq("service_user_id", serviceUserId)
    .is("archived_at", null)
    .is("achieved_at", null)
    .order("position", { ascending: true });
  return ((data as Array<{ id: string; title: string | null; statement: string | null; target_date: string | null }> | null) ?? [])
    .map((o) => ({ id: o.id, title: (o.title || o.statement || "Outcome").trim(), target: o.target_date }));
}

export type AppliedOutcomes = { updated: number; achieved: number; created: boolean; failed: string | null };

export async function applyOutcomesReview(opts: {
  companyId: string;
  serviceUserId: string;
  evidenceId: string;
  value: unknown;
  actorId: string;
  actorName: string | null;
  /** The review's own date (its first date answer), London. Today unless it was filed later. */
  onIso: string;
  todayIso: string;
}): Promise<AppliedOutcomes> {
  const db = createServiceClient();
  const v: OutcomesReviewValue = parseOutcomesReview(opts.value);
  const out: AppliedOutcomes = { updated: 0, achieved: 0, created: false, failed: null };
  const at = new Date().toISOString();
  /* A review filed after the day it happened speaks for ITS day, not the day it was typed in
     (Phil, 2026-10-13): its updates are dated the review's date, and a new outcome begins then.
     A review done today is exactly as before. */
  const backDated = opts.onIso < opts.todayIso;

  const onRecord = new Set((await outcomesForReview(opts.serviceUserId, db)).map((o) => o.id));

  // For a back dated review: when each outcome began and what is already on its timeline.
  const begun = new Map<string, string>();
  const timeline = new Map<string, TimelineUpdate[]>();
  if (backDated && onRecord.size > 0) {
    const ids = [...onRecord];
    const [{ data: outs }, { data: ups }] = await Promise.all([
      db.from("service_user_outcomes").select("id, start_date, created_at").in("id", ids),
      db.from("service_user_outcome_updates").select("outcome_id, kind, progress, dated_on, created_at").in("outcome_id", ids),
    ]);
    for (const o of (outs as Array<{ id: string; start_date: string | null; created_at: string }> | null) ?? []) {
      begun.set(o.id, outcomeFrom(o));
    }
    for (const u of (ups as Array<TimelineUpdate & { outcome_id: string }> | null) ?? []) {
      const list = timeline.get(u.outcome_id) ?? [];
      list.push(u);
      timeline.set(u.outcome_id, list);
    }
  }

  for (const line of v.current) {
    if (!line.progress || !onRecord.has(line.id)) continue;
    const achieved = line.progress === "achieved";
    // Never before the outcome began: an outcome added after the review took place is updated
    // from its first day.
    const dated = backDated ? [opts.onIso, begun.get(line.id) ?? opts.onIso].sort()[1] : null;
    const { error } = await db.from("service_user_outcome_updates").insert({
      company_id: opts.companyId,
      service_user_id: opts.serviceUserId,
      outcome_id: line.id,
      kind: achieved ? "completed" : "progress",
      progress: achieved ? null : line.progress,
      note: line.note.trim() || null,
      created_by: opts.actorId,
      author_name: opts.actorName,
      created_at: at,
      evidence_id: opts.evidenceId,
      ...(dated && dated < opts.todayIso ? { dated_on: dated } : {}),
    });
    if (error) {
      // 23505: this review's update is already there, so this is a second run. Not a failure.
      if (error.code === "23505") continue;
      out.failed = "An outcome update could not be saved to the Outcomes page.";
      continue;
    }
    // A back dated review moves an outcome's status only when nothing on it is later.
    if (dated && !pastUpdateIsLatest(timeline.get(line.id) ?? [], dated, false)) {
      if (achieved) out.achieved += 1;
      else out.updated += 1;
      continue;
    }
    const stamp = dated && dated < opts.todayIso ? middayOf(dated) : at;
    const { data: moved, error: upErr } = await db
      .from("service_user_outcomes")
      .update(
        achieved
          ? { status: "achieved", achieved_at: stamp, last_update_at: stamp, updated_by: opts.actorId, updated_at: at }
          : { status: line.progress, last_update_at: stamp, updated_by: opts.actorId, updated_at: at },
      )
      .eq("id", line.id)
      .eq("service_user_id", opts.serviceUserId)
      .eq("company_id", opts.companyId)
      .select("id");
    if (upErr || !moved?.length) out.failed = "An outcome's status could not be updated on the Outcomes page.";
    else if (achieved) out.achieved += 1;
    else out.updated += 1;
  }

  if (settingNew(v) && v.newTitle.trim()) {
    const { data: last } = await db
      .from("service_user_outcomes")
      .select("position")
      .eq("service_user_id", opts.serviceUserId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();
    const { error } = await db.from("service_user_outcomes").insert({
      company_id: opts.companyId,
      service_user_id: opts.serviceUserId,
      title: v.newTitle.trim(),
      detail: v.newSupport.trim() || null,
      target_date: v.newTarget || null,
      status: "working_towards",
      position: (last?.position ?? -1) + 1,
      created_by: opts.actorId,
      updated_by: opts.actorId,
      updated_at: at,
      source_evidence_id: opts.evidenceId,
      ...(backDated ? { start_date: opts.onIso } : {}),
    });
    if (!error) out.created = true;
    else if (error.code !== "23505") out.failed = "The new outcome could not be added to the Outcomes page.";
  }
  return out;
}
