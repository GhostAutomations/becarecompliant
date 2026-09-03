import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import EmailClient, { type EmailRow } from "@/components/founder/email-client";
import {
  sendInboxReply,
  setEmailRead,
  fetchEmailBody,
} from "@/app/(app)/founder/actions";

/**
 * Founder > Email.
 *
 * WHY IT EXISTS. Until 3 September 2026 Be Care Compliant could send and could not receive:
 * becarecompliant.com had no MX record, and the trial acknowledgement ended "just reply to this
 * email" from a no-reply address. Anyone who replied vanished. Two real care companies were told
 * that on 27 August.
 *
 * THE ARCHIVE IS THIS TABLE, NOT RESEND. Resend keeps received mail for 30 days on every plan,
 * Pro included. What is here is the permanent record, which is also why a body that failed to
 * arrive is chased rather than shrugged at.
 *
 * NO PAGE CHROME. Phil, 2026-09-03: "outlook isnt in a box it is the page, make it the page."
 * There is no heading, no card and no back link here — the client owns the whole area and puts
 * the way back into its own command bar, the way a mail client does.
 */

export const metadata: Metadata = { title: "Email" };

/** The address this mailbox IS, shown the way Outlook shows the account. */
function mailboxAddress(): string {
  const raw =
    process.env.RESEND_REPLY_FROM || process.env.CONTACT_EMAIL || "hello@becarecompliant.com";
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
}

export default async function FounderEmailPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data }, { data: leads }] = await Promise.all([
    supabase
      .from("founder_emails")
      .select(
        "id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, body_error, attachments, trial_request_id, is_read, is_spam, send_error, occurred_at",
      )
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabase.from("trial_requests").select("id, company_name"),
  ]);

  const rows = (data ?? []) as EmailRow[];
  const leadNames: Record<string, string> = {};
  for (const l of (leads ?? []) as Array<{ id: string; company_name: string }>) {
    leadNames[l.id] = l.company_name;
  }

  return (
    <div className="mailx-full">
      <EmailClient
        rows={rows}
        leadNames={leadNames}
        mailbox={mailboxAddress()}
        actions={{
          reply: sendInboxReply as never,
          setRead: setEmailRead as never,
          fetchBody: fetchEmailBody as never,
        }}
      />
    </div>
  );
}
