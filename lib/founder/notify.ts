import "server-only";

/**
 * Tell the founder something, in BOTH places (Phil, 2026-10-01: "it went to outlook i would also
 * like it to go in the founder email system as well"):
 *
 *   1. the Founder Inbox inside Be Care Compliant (a founder_emails row, direction "in"), which
 *      the open inbox shows at once by push; and
 *   2. an email to every platform admin's own address (Outlook), with a branded button.
 *
 * The inbox copy is written first, so it lands even when Resend is down or not configured.
 * Neither failure is silent: each is logged, and the result says which reached him, so a caller
 * that must not lose the message can tell nothing did.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml } from "@/lib/email/templates";

export function founderMailbox(): string {
  return process.env.CONTACT_EMAIL || "hello@becarecompliant.com";
}

export type FounderNotice = {
  subject: string;
  heading: string;
  preheader: string;
  /** Already escaped HTML. */
  bodyHtml: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  companyId?: string | null;
  /** Who it is from in the inbox. A person (so Reply answers them), or Be Care Compliant itself. */
  fromAddress?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
};

export async function notifyFounder(n: FounderNotice): Promise<{ inbox: boolean; emailed: number }> {
  const admin = createServiceClient();

  const { error: inboxError } = await admin.from("founder_emails").insert({
    direction: "in",
    from_address: n.fromAddress || founderMailbox(),
    from_name: n.fromName || "Be Care Compliant",
    to_addresses: [founderMailbox()],
    subject: n.subject,
    body_text: n.bodyText,
    body_html: n.bodyHtml,
    body_fetched_at: new Date().toISOString(),
    company_id: n.companyId ?? null,
  });
  if (inboxError) console.error("[notifyFounder] not filed in the founder inbox:", n.subject, inboxError.message);

  let emailed = 0;
  if (!resendConfigured()) {
    console.error("[notifyFounder] not emailed: RESEND_API_KEY / RESEND_FROM not configured:", n.subject);
  } else {
    const { data: founders } = await admin.from("profiles").select("email").eq("role", "platform_admin");
    const recipients = ((founders as Array<{ email: string | null }> | null) ?? [])
      .map((f) => f.email)
      .filter((e): e is string => Boolean(e));
    const html = noticeEmailHtml({
      preheader: n.preheader,
      heading: n.heading,
      bodyHtml: n.bodyHtml,
      ctaLabel: n.ctaLabel,
      ctaUrl: n.ctaUrl,
      footerNote: "You receive this because you are the platform admin for Be Care Compliant.",
    });
    for (const to of recipients) {
      const r = await sendEmail({ to, subject: n.subject, html, replyTo: n.replyTo || undefined });
      if (r.sent) emailed += 1;
      else console.error("[notifyFounder] email not sent:", n.subject, r.error ?? r.skippedReason);
    }
  }
  return { inbox: !inboxError, emailed };
}
