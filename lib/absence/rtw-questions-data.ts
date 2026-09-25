import "server-only";

/**
 * Reads for the Return to Work questions the employee answers (migration 0331). Through the
 * caller's own client, so RLS (can_run_rtw) decides who sees what: Company Admin, the branch's
 * Manager or Supervisor, and the person's own supervisor. The employee never reads this table;
 * they go through my_rtw_questions, which hands back the questions and nothing else.
 */

import { createClient } from "@/lib/supabase/server";
import { toAiQuestions, type AiQuestion } from "@/lib/forms";
import type { RtwQuestionnaireStatus } from "@/lib/absence/rtw-questions";

export type RtwQuestionnaire = {
  id: string;
  absenceEventId: string;
  status: RtwQuestionnaireStatus;
  summary: string | null;
  questions: AiQuestion[];
  answers: string[] | null;
  draftedByName: string | null;
  draftedAt: string;
  sentAt: string | null;
  sentByName: string | null;
  sentToLast4: string | null;
  sendCount: number;
  expiresAt: string | null;
  answeredAt: string | null;
};

export const RTW_QUESTIONNAIRE_COLUMNS =
  "id, absence_event_id, status, summary, questions, answers, drafted_by_name, drafted_at, sent_at, sent_by_name, sent_to_last4, send_count, expires_at, answered_at";

type Row = {
  id: string;
  absence_event_id: string;
  status: RtwQuestionnaireStatus;
  summary: string | null;
  questions: unknown;
  answers: unknown;
  drafted_by_name: string | null;
  drafted_at: string;
  sent_at: string | null;
  sent_by_name: string | null;
  sent_to_last4: string | null;
  send_count: number | null;
  expires_at: string | null;
  answered_at: string | null;
};

export function toQuestionnaire(r: Row): RtwQuestionnaire {
  return {
    id: r.id,
    absenceEventId: r.absence_event_id,
    status: r.status,
    summary: r.summary,
    questions: toAiQuestions(r.questions),
    answers: Array.isArray(r.answers) ? (r.answers as unknown[]).map((a) => String(a ?? "")) : null,
    draftedByName: r.drafted_by_name,
    draftedAt: r.drafted_at,
    sentAt: r.sent_at,
    sentByName: r.sent_by_name,
    sentToLast4: r.sent_to_last4,
    sendCount: Number(r.send_count ?? 0),
    expiresAt: r.expires_at,
    answeredAt: r.answered_at,
  };
}

/** The saved questions for one absence, or null when none have been drafted (or the caller
 *  is not allowed to see them). */
export async function getRtwQuestionnaire(absenceEventId: string): Promise<RtwQuestionnaire | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rtw_questionnaires")
    .select(RTW_QUESTIONNAIRE_COLUMNS)
    .eq("absence_event_id", absenceEventId)
    .maybeSingle();
  return data ? toQuestionnaire(data as Row) : null;
}

/** The saved questions for several absences at once, keyed by absence id. */
export async function listRtwQuestionnaires(
  absenceEventIds: string[],
): Promise<Record<string, RtwQuestionnaire>> {
  const out: Record<string, RtwQuestionnaire> = {};
  if (absenceEventIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("rtw_questionnaires")
    .select(RTW_QUESTIONNAIRE_COLUMNS)
    .in("absence_event_id", absenceEventIds);
  for (const r of (data as Row[] | null) ?? []) {
    const q = toQuestionnaire(r);
    out[q.absenceEventId] = q;
  }
  return out;
}
