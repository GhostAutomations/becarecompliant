import "server-only";

/**
 * Be Care Compliant — the absence stage history switch (Phil, 2026-10-13).
 *
 * companies.absence_stage_history (0457), on for Bevan only to start. Only the founder can change
 * it (companies_guard_founder_columns). With it off, every screen, check and letter works exactly
 * as before; with it on, a person's stages are worked out at the date of each absence
 * (lib/absence/stage-history.ts) and every stage reached stays until its meeting is held.
 *
 * Every place that works out a person's absence stage comes through absenceStatusesFor, which reads
 * the switch and hands lib/absence/logic.ts resolveAbsenceStatus its inputs only when it is on.
 * Before 0457 is applied the column is missing, the read fails and the switch reads as off.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import {
  aggregateFromSummary,
  resolveAbsenceStatus,
  type AbsenceConfig,
  type AbsenceStatus,
  type StageHistoryInputs,
} from "./logic";
import type { HistoryEvent, HistoryMeeting } from "./stage-history";

/** Whether the company has the stage history switched on. Off on any doubt. */
export async function absenceStageHistoryOn(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false;
  const { data, error } = await createServiceClient()
    .from("companies")
    .select("absence_stage_history")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    // Before 0457 the column does not exist: off, exactly as before.
    if (!/absence_stage_history/.test(error.message)) console.error("[absence] switch read failed:", error.message);
    return false;
  }
  return (data as { absence_stage_history?: boolean } | null)?.absence_stage_history === true;
}

/**
 * Every absence and meeting of these people (or of the company, or one branch), through the
 * caller's own client so RLS decides what is read. Grouped by person.
 */
export async function loadStageInputs(
  supabase: SupabaseClient,
  scope: { companyId: string; personIds?: string[]; branchId?: string | null },
): Promise<Map<string, StageHistoryInputs>> {
  const todayIso = formatCivilDate(todayInLondon());
  let evq = supabase
    .from("absence_events")
    .select("id, person_id, start_date, end_date, discounted_at")
    .eq("company_id", scope.companyId);
  let mtq = supabase
    .from("absence_meetings")
    .select("id, person_id, stage, meeting_date, evidence_id, response, deals_with_later, warning_issued")
    .eq("company_id", scope.companyId);
  if (scope.personIds) {
    evq = evq.in("person_id", scope.personIds);
    mtq = mtq.in("person_id", scope.personIds);
  }
  if (scope.branchId) {
    evq = evq.eq("branch_id", scope.branchId);
    mtq = mtq.eq("branch_id", scope.branchId);
  }
  const [{ data: events, error: evErr }, { data: meetings, error: mtErr }] = await Promise.all([evq, mtq]);
  if (evErr || mtErr) throw new Error(`Absence history could not be read: ${(evErr ?? mtErr)?.message}`);

  const byPerson = new Map<string, StageHistoryInputs>();
  const slot = (id: string) => {
    let s = byPerson.get(id);
    if (!s) byPerson.set(id, (s = { events: [], meetings: [], todayIso }));
    return s;
  };
  for (const e of (events ?? []) as Array<HistoryEvent & { person_id: string }>) {
    slot(e.person_id).events.push({ id: e.id, start_date: e.start_date, end_date: e.end_date, discounted_at: e.discounted_at });
  }
  for (const m of (meetings ?? []) as Array<{
    id: string;
    person_id: string;
    stage: number | null;
    meeting_date: string | null;
    evidence_id: string | null;
    response: string | null;
    deals_with_later: boolean | null;
    warning_issued: string | null;
  }>) {
    const meeting: HistoryMeeting = {
      id: m.id,
      stage: m.stage,
      meeting_date: m.meeting_date,
      held: !!m.evidence_id,
      declined: !m.evidence_id && m.response === "declined",
      dealsWithLater: m.deals_with_later === true,
      warned: !!m.warning_issued && !["", "none"].includes(m.warning_issued.trim().toLowerCase()),
    };
    slot(m.person_id).meetings.push(meeting);
  }
  return byPerson;
}

/**
 * THE shared entry point: the absence status of each person, from their person_absence_summary
 * rows. Switch off: the old count, row by row, nothing else read. Switch on (stages method): the
 * stage history, from every absence and meeting they have.
 */
export async function absenceStatusesFor(
  supabase: SupabaseClient,
  companyId: string,
  config: AbsenceConfig,
  rows: Array<Record<string, unknown> & { person_id: string }>,
  opts: { on?: boolean; inputs?: Map<string, StageHistoryInputs>; branchId?: string | null } = {},
): Promise<Map<string, AbsenceStatus>> {
  const on = config.method === "stages" && (opts.on ?? (await absenceStageHistoryOn(companyId)));
  const inputs = on
    ? opts.inputs ?? (await loadStageInputs(supabase, { companyId, personIds: rows.map((r) => r.person_id), branchId: opts.branchId }))
    : null;
  const out = new Map<string, AbsenceStatus>();
  for (const row of rows) {
    const mine = inputs ? inputs.get(row.person_id) ?? { events: [], meetings: [], todayIso: formatCivilDate(todayInLondon()) } : null;
    out.set(row.person_id, resolveAbsenceStatus(aggregateFromSummary(row), config, mine));
  }
  return out;
}

/** One person's status, for the server checks (booking, recording, the drafted questions). */
export async function absenceStatusForPerson(
  supabase: SupabaseClient,
  companyId: string,
  config: AbsenceConfig,
  personId: string,
  summary: Record<string, unknown> | null,
): Promise<AbsenceStatus> {
  const statuses = await absenceStatusesFor(supabase, companyId, config, [{ ...(summary ?? {}), person_id: personId }]);
  return statuses.get(personId) as AbsenceStatus;
}
