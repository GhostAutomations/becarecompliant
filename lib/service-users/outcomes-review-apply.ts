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
}): Promise<AppliedOutcomes> {
  const db = createServiceClient();
  const v: OutcomesReviewValue = parseOutcomesReview(opts.value);
  const out: AppliedOutcomes = { updated: 0, achieved: 0, created: false, failed: null };
  const at = new Date().toISOString();

  const onRecord = new Set((await outcomesForReview(opts.serviceUserId, db)).map((o) => o.id));

  for (const line of v.current) {
    if (!line.progress || !onRecord.has(line.id)) continue;
    const achieved = line.progress === "achieved";
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
    });
    if (error) {
      // 23505: this review's update is already there, so this is a second run. Not a failure.
      if (error.code === "23505") continue;
      out.failed = "An outcome update could not be saved to the Outcomes page.";
      continue;
    }
    const { error: upErr } = await db
      .from("service_user_outcomes")
      .update(
        achieved
          ? { status: "achieved", achieved_at: at, last_update_at: at, updated_by: opts.actorId, updated_at: at }
          : { status: line.progress, last_update_at: at, updated_by: opts.actorId, updated_at: at },
      )
      .eq("id", line.id)
      .eq("service_user_id", opts.serviceUserId)
      .eq("company_id", opts.companyId);
    if (upErr) out.failed = "An outcome's status could not be updated on the Outcomes page.";
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
    });
    if (!error) out.created = true;
    else if (error.code !== "23505") out.failed = "The new outcome could not be added to the Outcomes page.";
  }
  return out;
}
