import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MeetingLetterCopy = {
  id: string;
  meeting_id: string | null;
  kind: "invite" | "rearranged";
  stage: number | null;
  meeting_date: string | null;
  sent_at: string;
  sent_by_name: string | null;
  rebuilt: boolean;
};

/** The kept employee invitation letters for one person, newest first (0406). Read through the
 *  caller's RLS client, so it is empty for anyone who does not prepare that person's meetings. */
export async function listMeetingLetters(personId: string): Promise<MeetingLetterCopy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_meeting_letters")
    .select("id, meeting_id, kind, stage, meeting_date, sent_at, sent_by_name, rebuilt")
    .eq("person_id", personId)
    .order("sent_at", { ascending: false });
  return (data as MeetingLetterCopy[] | null) ?? [];
}

/** What the Evidence history calls a kept letter. */
export function meetingLetterName(l: Pick<MeetingLetterCopy, "kind">): string {
  return l.kind === "rearranged" ? "Absence meeting invitation (rearranged)" : "Absence meeting invitation";
}
