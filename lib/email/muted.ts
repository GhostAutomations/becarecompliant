import "server-only";

/**
 * TEST COMPANIES SEND NOTHING (Phil, 2026-10-02: "turn all emails for Bevan off ... the morning
 * emails, any alerts, any staff emails, because it's a test company it doesn't get any emails").
 *
 * A company marked as a test company on Founder > company (companies.is_test, 0353) sends no
 * email and no text. Checked here, in the one place every company email and text goes out
 * (sendEmail, sendEmailBatch and sendSms when given the company). Two things still go, by
 * Phil's choice (popup 2026-10-02): password resets and login invites, so a test login can
 * never be locked out. They are sent without a company, so this never sees them. Founder
 * emails (trial requests, demo login details, the inbox) are not company emails either.
 *
 * Read past RLS with the service client, because a cron or a webhook has no user. Cached for a
 * minute per server instance; if the answer cannot be read it does NOT mute, so a real company
 * is never silenced by a database hiccup.
 */

export const TEST_COMPANY_NO_MESSAGES = "Test company: emails and texts are switched off, so nothing was sent.";

const cache = new Map<string, { muted: boolean; at: number }>();
const TTL_MS = 60_000;

export async function isMessagingMuted(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false;
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.muted;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { data } = await createServiceClient().from("companies").select("is_test").eq("id", companyId).maybeSingle();
    const muted = Boolean((data as { is_test?: boolean } | null)?.is_test);
    cache.set(companyId, { muted, at: Date.now() });
    return muted;
  } catch {
    return false;
  }
}
