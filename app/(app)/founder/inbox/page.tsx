import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
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
 * The screen itself is a client component so a message can be selected without a round trip;
 * this file does the reading and hands the server actions down as props.
 */

export const metadata: Metadata = { title: "Email" };

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
    <div className="w-full space-y-5">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Email</h1>
        <p className="page-subtitle">
          Everything the platform has received or sent, kept here for good. Replies go out from
          your own address and land in the thread the person started.
        </p>
      </div>

      <EmailClient
        rows={rows}
        leadNames={leadNames}
        actions={{
          reply: sendInboxReply as never,
          setRead: setEmailRead as never,
          fetchBody: fetchEmailBody as never,
        }}
      />
    </div>
  );
}
