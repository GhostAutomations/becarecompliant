import "server-only";
import { sendEmail, type SendResult } from "@/lib/email/resend";
import { calendarInviteEmailHtml } from "@/lib/email/templates";
import { buildIcs, icsToBase64 } from "@/lib/email/ics";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { siteUrl } from "@/lib/site";

/**
 * Shared calendar-invite sender for the two Phase 6 carried items: the Service
 * User Planned Review reviewer invite and the absence management meeting
 * invite. One branded email + one .ics attachment per recipient, idempotent
 * via notification_log (rebooking the same date never re-sends; a NEW date is
 * a new dedupe key so the recipient gets the updated invitation).
 *
 * Dependency: silently no-ops when RESEND_API_KEY / RESEND_FROM are missing
 * (result.skippedReason set); callers record that in audit metadata.
 */
export async function sendCalendarInvite(opts: {
  companyId: string;
  branchId?: string | null;
  companyName: string;
  kind: "su_review_invite" | "absence_meeting_invite";
  dedupeKey: string;
  recipient: { profileId?: string | null; name: string; email: string };
  eventTitle: string;
  /** ISO date; all-day unless timeHHMM is set. */
  dateIso: string;
  /** "HH:MM" Europe/London wall time for a timed event. */
  timeHHMM?: string | null;
  durationMinutes?: number | null;
  /** An address or a video call such as Teams; lands in the .ics LOCATION. */
  location?: string | null;
  detailHtml: string;
  icsUid: string;
}): Promise<SendResult & { deduped?: boolean }> {
  const subject = `${opts.eventTitle}: ${ukDate(opts.dateIso)}${opts.timeHHMM ? `, ${opts.timeHHMM}` : ""}`;

  const logId = await claimNotification({
    companyId: opts.companyId,
    branchId: opts.branchId ?? null,
    recipientProfileId: opts.recipient.profileId ?? null,
    channel: "email",
    kind: opts.kind,
    dedupeKey: opts.dedupeKey,
    toAddress: opts.recipient.email,
    subject,
    metadata: { date: opts.dateIso },
  });
  if (!logId) return { sent: false, deduped: true };

  const ics = buildIcs({
    uid: opts.icsUid,
    date: opts.dateIso,
    time: opts.timeHHMM ?? null,
    durationMinutes: opts.durationMinutes ?? null,
    location: opts.location ?? null,
    summary: opts.eventTitle,
    description: `${opts.eventTitle} at ${opts.companyName}. Details in Be Care Compliant.`,
    organizerEmail: organizerAddress(),
    organizerName: opts.companyName,
    attendees: [{ name: opts.recipient.name, email: opts.recipient.email }],
  });

  const result = await sendEmail({
    to: opts.recipient.email,
    subject,
    html: calendarInviteEmailHtml({
      recipientName: opts.recipient.name,
      companyName: opts.companyName,
      eventTitle: opts.eventTitle,
      dateIso: opts.dateIso,
      timeHHMM: opts.timeHHMM ?? null,
      durationMinutes: opts.durationMinutes ?? null,
      detailHtml: opts.detailHtml,
      actionUrl: siteUrl(),
    }),
    attachments: [
      {
        filename: "invite.ics",
        content: icsToBase64(ics),
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      },
    ],
  });

  await settleNotification(
    logId,
    result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
    result.error ?? result.skippedReason,
  );
  return result;
}

/** The ORGANIZER mailto, from RESEND_FROM ("Name <a@b>" or bare address). */
function organizerAddress(): string | undefined {
  const from = process.env.RESEND_FROM ?? "";
  const match = from.match(/<([^>]+)>/);
  return match?.[1] ?? (from.includes("@") ? from : undefined);
}

function ukDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
