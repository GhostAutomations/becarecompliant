import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toAiQuestions, type AiQuestion } from "@/lib/forms";

/**
 * Drafted meeting questions still waiting to be asked (migration 0342), for the Absence page.
 * Keyed so the page can find the set for each Record meeting dialog:
 *   "meeting:<absence_meetings id>" for a booked meeting,
 *   "person:<person id>" for a meeting being recorded without a booking.
 * Recorded sets (evidence_id set) are left out: what was asked is in the Evidence. RLS keeps this
 * to the people who can prepare the meeting.
 */
export async function listOpenMeetingQuestions(
  companyId: string,
): Promise<Record<string, AiQuestion[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_meeting_questions")
    .select("person_id, meeting_id, questions")
    .eq("company_id", companyId)
    .is("evidence_id", null);
  const out: Record<string, AiQuestion[]> = {};
  for (const r of (data ?? []) as Array<{ person_id: string; meeting_id: string | null; questions: unknown }>) {
    const qs = toAiQuestions(r.questions);
    if (qs.length === 0) continue;
    out[r.meeting_id ? `meeting:${r.meeting_id}` : `person:${r.person_id}`] = qs;
  }
  return out;
}
