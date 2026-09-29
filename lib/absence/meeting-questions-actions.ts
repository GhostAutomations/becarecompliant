"use server";

/**
 * Be Care Compliant — draft the questions for a formal absence meeting (Phil, 2026-09-29, Absence
 * round 2 item 2). Pressed inside Record meeting. The questions are written from the person's
 * absences, what they said at their Return to Works and what earlier meetings agreed, and appear
 * as a "Questions to ask" section; the answers typed against them are saved into the meeting
 * Evidence (meeting_questions) when the meeting is saved.
 *
 * DRAFTED ONCE, KEPT (the Return to Work rule, Phil 2026-09-25): the set is saved the moment it is
 * written (absence_meeting_questions, 0342), so opening the meeting again reads it back and spends
 * nothing. Costs one AI credit, refunded by runAi when the call fails.
 */

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { runAi } from "@/lib/ai/anthropic";
import { stripJsonFence, toAiQuestions, type ActionState, type AiQuestion } from "@/lib/forms";
import { getAbsenceConfig } from "@/lib/absence/data";
import { stageActionFor } from "@/lib/absence/stage-actions";
import { absenceCountState, countedAbsences, windowStartIso } from "@/lib/absence/discount";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import type { StageThreshold } from "@/lib/absence/logic";
import {
  MEETING_QUESTIONS_SYSTEM,
  buildMeetingPrompt,
  discussedAbsences,
  meetingNotesFromAnswers,
  rtwNotesFromAnswers,
  rtwNotesFromPortal,
  type MeetingAbsence,
} from "@/lib/absence/meeting-questions";

function readQuestions(raw: string): AiQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return toAiQuestions(parsed);
  if (parsed && typeof parsed === "object") return toAiQuestions((parsed as Record<string, unknown>).questions);
  return [];
}

function drafted(questions: AiQuestion[]): ActionState {
  return { ok: "Drafted", data: { ai_questions: JSON.stringify(questions) } };
}

type EventRow = MeetingAbsence & {
  id: string;
  discounted_at: string | null;
  rtw_evidence_id: string | null;
};

export async function draftMeetingQuestions(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing person." };
  const meetingId = String(formData.get("meeting_id") ?? "").trim() || null;

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("id, company_id, branch_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person || person.company_id !== profile.company_id) {
    return { error: "That record could not be found." };
  }
  const { data: allowed } = await supabase.rpc("can_prepare_absence_meeting", { p_person_id: personId });
  if (allowed !== true) return { error: "You cannot prepare absence meetings for this person." };

  // The booking, when there is one. It must be this person's and not yet recorded.
  let stage: number | null = null;
  if (meetingId) {
    const { data: booking } = await supabase
      .from("absence_meetings")
      .select("id, person_id, stage, evidence_id")
      .eq("id", meetingId)
      .maybeSingle();
    if (!booking || booking.person_id !== personId) return { error: "That meeting could not be found." };
    if (booking.evidence_id) return { error: "This meeting has already been recorded." };
    stage = (booking.stage as number | null) ?? null;
  }

  // Already drafted for this meeting: hand it back and spend nothing.
  const saved = await savedSet(supabase, personId, meetingId);
  if (saved.length > 0) return drafted(saved);

  // ---- The record the questions are written from.
  const config = await getAbsenceConfig(person.company_id as string);
  const windowStart = windowStartIso(formatCivilDate(todayInLondon()), config.window);
  const { data: evRows } = await supabase
    .from("absence_events")
    .select("id, start_date, end_date, days, reason, discounted_at, rtw_evidence_id")
    .eq("person_id", personId)
    .order("start_date", { ascending: true });
  const events = ((evRows ?? []) as EventRow[]).map((e) => ({
    ...e,
    days: e.days === null ? null : Number(e.days),
  }));
  const counted = countedAbsences(events, { windowStart });
  const discountedCount = events.filter((e) => absenceCountState(e, { windowStart }) === "discounted").length;
  const thresholds =
    config.method === "stages"
      ? (config.thresholds as StageThreshold[])
          .filter((t) => typeof t.occasions === "number")
          .map((t) => ({ stage: Number(t.stage), occasions: Number(t.occasions) }))
      : [];
  const discussed = discussedAbsences(counted, stage, thresholds);
  const discussedIds = new Set(discussed.map((d) => d.e.id));
  const numbered = counted.map((e, i) => ({ e, n: i + 1 }));
  const otherCounted = numbered.filter((d) => !discussedIds.has(d.e.id));

  // Return to Work: the recorded interview, or failing that what they answered in their portal.
  const rtwIds = counted.map((e) => e.rtw_evidence_id).filter((id): id is string => !!id);
  const rtwAnswers = new Map<string, Record<string, unknown>>();
  if (rtwIds.length > 0) {
    const { data: ev } = await supabase.from("evidence").select("id, answers").in("id", rtwIds);
    for (const r of (ev ?? []) as Array<{ id: string; answers: Record<string, unknown> | null }>) {
      if (r.answers) rtwAnswers.set(r.id, r.answers);
    }
  }
  const { data: portal } = await supabase
    .from("rtw_questionnaires")
    .select("absence_event_id, questions, answers")
    .eq("person_id", personId)
    .not("answers", "is", null);
  const portalByAbsence = new Map<string, string>();
  for (const q of (portal ?? []) as Array<{ absence_event_id: string; questions: unknown; answers: unknown[] | null }>) {
    const note = rtwNotesFromPortal(toAiQuestions(q.questions), q.answers);
    if (note) portalByAbsence.set(q.absence_event_id, note);
  }
  const rtw = numbered
    .map(({ e, n }) => {
      const recorded = e.rtw_evidence_id ? rtwNotesFromAnswers(rtwAnswers.get(e.rtw_evidence_id)) : "";
      return { n, notes: recorded || portalByAbsence.get(e.id) || "" };
    })
    .filter((r) => r.notes);

  // Earlier meetings in the review period, and what they agreed.
  const { data: past } = await supabase
    .from("absence_meetings")
    .select("stage, meeting_date, evidence_id")
    .eq("person_id", personId)
    .not("evidence_id", "is", null)
    .gte("meeting_date", windowStart)
    .order("meeting_date", { ascending: true });
  const pastRows = (past ?? []) as Array<{ stage: number | null; meeting_date: string | null; evidence_id: string }>;
  const pastAnswers = new Map<string, Record<string, unknown>>();
  if (pastRows.length > 0) {
    const { data: ev } = await supabase
      .from("evidence")
      .select("id, answers")
      .in("id", pastRows.map((m) => m.evidence_id));
    for (const r of (ev ?? []) as Array<{ id: string; answers: Record<string, unknown> | null }>) {
      if (r.answers) pastAnswers.set(r.id, r.answers);
    }
  }
  const earlierMeetings = pastRows.slice(-3).map((m) => ({
    stage: m.stage,
    date: m.meeting_date,
    notes: meetingNotesFromAnswers(pastAnswers.get(m.evidence_id)),
  }));

  const prompt = buildMeetingPrompt({
    stage,
    stageAction: stageActionFor(config, stage),
    discussed: discussed.map((d) => ({ n: d.n, a: d.e })),
    otherCounted: otherCounted.map((d) => ({ n: d.n, a: d.e })),
    rtw,
    earlierMeetings,
    discountedCount,
  });

  const result = await runAi({
    companyId: profile.company_id,
    feature: "absence_meeting_questions",
    prompt,
    system: MEETING_QUESTIONS_SYSTEM,
    maxTokens: 1600,
  });
  if ("error" in result) return { error: result.error };

  const questions = readQuestions(result.ok);
  if (questions.length === 0) {
    // Nothing usable as questions. Hand the text back into the questions box rather than waste
    // the credit: meeting_questions is a real field, so it lands there to edit.
    return { ok: "Drafted", data: { meeting_questions: result.ok } };
  }

  const { error: insErr } = await supabase.from("absence_meeting_questions").insert({
    company_id: person.company_id as string,
    person_id: personId,
    branch_id: (person.branch_id as string | null) ?? null,
    meeting_id: meetingId,
    stage,
    questions,
    drafted_by: profile.id,
    drafted_by_name: profile.full_name,
  });
  if (insErr) {
    // Two people pressing at once: the first set wins and both see it.
    const won = await savedSet(supabase, personId, meetingId);
    if (won.length > 0) return drafted(won);
  }
  return drafted(questions);
}

async function savedSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  meetingId: string | null,
): Promise<AiQuestion[]> {
  let q = supabase
    .from("absence_meeting_questions")
    .select("questions")
    .eq("person_id", personId)
    .is("evidence_id", null)
    .limit(1);
  q = meetingId ? q.eq("meeting_id", meetingId) : q.is("meeting_id", null);
  const { data } = await q.maybeSingle();
  return toAiQuestions((data as { questions?: unknown } | null)?.questions);
}
