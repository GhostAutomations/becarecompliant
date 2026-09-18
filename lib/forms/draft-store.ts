/**
 * Be Care Compliant — reading and writing a part-finished Form.
 *
 * Plain server functions (NOT a "use server" module) so the completion actions can
 * discard a draft as part of filing the Evidence, the way createLog discards the
 * Handover draft. The browser reaches these through lib/forms/drafts.ts.
 *
 * Every function here is SILENT on failure. A draft is a convenience laid over the
 * real form: a database that will not take it must never interrupt someone typing,
 * and must never stop a completed Check being filed.
 */

import { createClient } from "@/lib/supabase/server";
import type { Answers } from "@/lib/form-schema";
import { draftFresh } from "@/lib/forms/draft-key";

type Session = { userId: string; companyId: string };

/** Who is asking, without the page guards: this is called from a fire-and-forget
 *  autosave, and requireCompany() redirects, which a background save cannot do.
 *  RLS is the real guard -- a user only ever sees the row with their own id. */
async function session(): Promise<Session | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  const companyId = (profile?.company_id as string | null) ?? null;
  if (!companyId) return null;
  return { userId, companyId };
}

/** The caller's part-finished answers for one form, if they typed them within the
 *  last twelve hours. Anything older is left where it is and reads as nothing. */
export async function readDraft(key: string): Promise<Answers | null> {
  if (!key) return null;
  try {
    const s = await session();
    if (!s) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("form_drafts")
      .select("data, updated_at")
      .eq("user_id", s.userId)
      .eq("draft_key", key)
      .maybeSingle();
    if (!data) return null;
    if (!draftFresh(data.updated_at as string)) return null;
    const answers = (data.data as Answers | null) ?? null;
    return answers && Object.keys(answers).length > 0 ? answers : null;
  } catch {
    return null;
  }
}

/** Keep what they have typed so far. One row per user per form, overwritten. */
export async function writeDraft(key: string, answers: Answers): Promise<void> {
  if (!key) return;
  try {
    const s = await session();
    if (!s) return;
    const supabase = await createClient();
    await supabase.from("form_drafts").upsert(
      {
        user_id: s.userId,
        draft_key: key,
        company_id: s.companyId,
        data: answers ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,draft_key" },
    );
  } catch {
    // Silent: a failed autosave must never interrupt typing.
  }
}

/** Throw the draft away. Called when the form is filed, and when it is abandoned
 *  on purpose. Never a broad delete: the user's own id AND the one key. */
export async function dropDraft(key: string): Promise<void> {
  if (!key) return;
  try {
    const s = await session();
    if (!s) return;
    const supabase = await createClient();
    await supabase.from("form_drafts").delete().eq("user_id", s.userId).eq("draft_key", key);
  } catch {
    // Silent: the Evidence is filed either way.
  }
}
