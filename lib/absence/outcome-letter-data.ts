import "server-only";
import { createClient } from "@/lib/supabase/server";

/** One meeting's outcome letter, as the screens need it (0343). RLS: the people who prepare meetings. */
export type OutcomeLetterSummary = {
  meetingId: string;
  status: "drafted" | "sent" | "not_emailed" | "send_failed";
  /** The words to start from when it has not gone yet: what was approved (a failed send) or drafted. */
  body: string | null;
  emailedTo: string | null;
  sentAt: string | null;
  hasPdf: boolean;
};

export async function listOutcomeLetters(filter: {
  personId?: string;
  companyId?: string;
}): Promise<Record<string, OutcomeLetterSummary>> {
  const supabase = await createClient();
  let q = supabase
    .from("absence_outcome_letters")
    .select("meeting_id, status, draft_body, approved_body, emailed_to, emailed_at, approved_at, pdf_path");
  if (filter.personId) q = q.eq("person_id", filter.personId);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  const { data } = await q;
  const out: Record<string, OutcomeLetterSummary> = {};
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const status = r.status as OutcomeLetterSummary["status"];
    const final = status === "sent" || status === "not_emailed";
    out[r.meeting_id as string] = {
      meetingId: r.meeting_id as string,
      status,
      body: final ? null : ((r.approved_body as string | null) || (r.draft_body as string | null) || null),
      emailedTo: (r.emailed_to as string | null) ?? null,
      sentAt: ((r.emailed_at as string | null) ?? (r.approved_at as string | null)) ?? null,
      hasPdf: Boolean(r.pdf_path),
    };
  }
  return out;
}
