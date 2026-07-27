import "server-only";

/**
 * Return to Work. Phil's standing rule (2026-07-11) is that a Return to Work interview
 * happens after EVERY absence at EVERY stage, not just the first one or two, so the
 * system raises it rather than relying on a manager remembering: migration 0142 puts
 * rtw_due_date on absence_events through a trigger the moment an absence has a return
 * or end date, and outstanding means that date is set and rtw_evidence_id is not.
 *
 * Reads only. The completing action lives in lib/absence/rtw-actions.ts.
 */

import { createClient } from "@/lib/supabase/server";

export type OutstandingRtw = {
  absenceEventId: string;
  personId: string;
  personName: string;
  branchName: string;
  startDate: string;
  endDate: string | null;
  returnDate: string | null;
  days: number | null;
  reason: string | null;
  dueDate: string;
  /** Red once the due date has passed, amber while it is still ahead. */
  overdue: boolean;
};

/** Today as YYYY-MM-DD in Europe/London, matching the rest of the app. */
function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

/** Every Return to Work still to be done, soonest due first. RLS scopes this to the
 *  branches the caller can see, so a Branch Manager gets their own and no more. */
export async function listOutstandingRtw(companyId: string): Promise<OutstandingRtw[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_events")
    .select(
      "id, person_id, start_date, end_date, return_date, days, reason, rtw_due_date, people(full_name), branches(name)",
    )
    .eq("company_id", companyId)
    .is("rtw_evidence_id", null)
    .not("rtw_due_date", "is", null)
    .order("rtw_due_date", { ascending: true })
    .limit(200);

  const today = londonToday();
  return ((data as Array<{
    id: string;
    person_id: string;
    start_date: string;
    end_date: string | null;
    return_date: string | null;
    days: number | null;
    reason: string | null;
    rtw_due_date: string;
    people: { full_name: string } | null;
    branches: { name: string } | null;
  }> | null) ?? []).map((r) => ({
    absenceEventId: r.id,
    personId: r.person_id,
    personName: r.people?.full_name ?? "Unknown",
    branchName: r.branches?.name ?? "",
    startDate: r.start_date,
    endDate: r.end_date,
    returnDate: r.return_date,
    days: r.days === null ? null : Number(r.days),
    reason: r.reason,
    dueDate: r.rtw_due_date,
    overdue: r.rtw_due_date < today,
  }));
}

export type RtwContext = {
  absenceEventId: string;
  personId: string;
  personName: string;
  startDate: string;
  endDate: string | null;
  returnDate: string | null;
  days: number | null;
  reason: string | null;
  dueDate: string | null;
  done: boolean;
  /** Their other absences in the last year, so the interview can be informed by the
   *  pattern rather than this one occasion in isolation. */
  recent: Array<{ start_date: string; end_date: string | null; days: number | null; reason: string | null }>;
};

/** One absence and the context a Return to Work needs. */
export async function getRtwContext(absenceEventId: string): Promise<RtwContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_events")
    .select("id, person_id, start_date, end_date, return_date, days, reason, rtw_due_date, rtw_evidence_id, people(full_name)")
    .eq("id", absenceEventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    person_id: string;
    start_date: string;
    end_date: string | null;
    return_date: string | null;
    days: number | null;
    reason: string | null;
    rtw_due_date: string | null;
    rtw_evidence_id: string | null;
    people: { full_name: string } | null;
  };

  const { data: recent } = await supabase
    .from("absence_events")
    .select("start_date, end_date, days, reason")
    .eq("person_id", row.person_id)
    .neq("id", absenceEventId)
    .order("start_date", { ascending: false })
    .limit(6);

  return {
    absenceEventId: row.id,
    personId: row.person_id,
    personName: row.people?.full_name ?? "Unknown",
    startDate: row.start_date,
    endDate: row.end_date,
    returnDate: row.return_date,
    days: row.days === null ? null : Number(row.days),
    reason: row.reason,
    dueDate: row.rtw_due_date,
    done: Boolean(row.rtw_evidence_id),
    recent: ((recent as Array<{
      start_date: string;
      end_date: string | null;
      days: number | null;
      reason: string | null;
    }> | null) ?? []),
  };
}
