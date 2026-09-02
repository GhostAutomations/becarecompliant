import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { londonDateIso } from "@/lib/notifications/digest";
import {
  hoursWaiting,
  waitingLabel,
  chaseSubject,
  chaseOpening,
  CHASE_FOOTER,
  type TrialAlertRow,
} from "@/lib/founder/trial-alerts";

/**
 * The daily chase for trial requests nobody has answered.
 *
 * WHY THIS EXISTS: two care companies asked for a trial on 27 August 2026 and were still
 * waiting six days later. The product chases a registered manager about an overdue supervision
 * every single day without fail; it was not chasing its own founder about a customer trying to
 * hand over money. This closes that.
 *
 * ONE EMAIL, not one per request: a digest is what gets read. It repeats every day while
 * anything is still New, and marking a request Contacted, Provisioned or Declined stops it —
 * which every chase says out loud, because a reminder with no off switch gets filtered.
 *
 * DEDUPE lives on the request rows themselves (founder_chased_at), not in notification_log:
 * that table's company_id is NOT NULL and a trial request has no company yet. One chase per
 * London day, so the 06:00/07:00 UTC double schedule cannot double-send.
 */

export type ChaseResult = {
  waiting: number;
  sent: boolean;
  skipped?: string;
  errors: string[];
};

export async function runTrialRequestChase(now: Date = new Date()): Promise<ChaseResult> {
  const supabase = createServiceClient();
  const errors: string[] = [];

  const { data, error } = await supabase
    .from("trial_requests")
    .select(
      "id, company_name, contact_name, email, status, created_at, founder_alerted_at, founder_alert_error, founder_chased_at, founder_chase_count",
    )
    .eq("status", "new")
    .order("created_at", { ascending: true });

  if (error) return { waiting: 0, sent: false, errors: [error.message] };

  const waiting = (data ?? []) as Array<
    TrialAlertRow & { founder_chased_at: string | null; founder_chase_count: number }
  >;
  if (waiting.length === 0) return { waiting: 0, sent: false, skipped: "nothing waiting", errors };

  const today = londonDateIso(now);
  const alreadyToday = waiting.every(
    (r) => r.founder_chased_at && londonDateIso(new Date(r.founder_chased_at)) === today,
  );
  if (alreadyToday) return { waiting: waiting.length, sent: false, skipped: "already chased today", errors };

  if (!resendConfigured()) {
    return {
      waiting: waiting.length,
      sent: false,
      skipped: "email not configured",
      errors: ["RESEND_API_KEY / RESEND_FROM not configured"],
    };
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "platform_admin");
  const recipients = ((admins as Array<{ email: string | null }> | null) ?? [])
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  if (recipients.length === 0) {
    return {
      waiting: waiting.length,
      sent: false,
      skipped: "no platform admin email",
      errors: ["No platform admin has an email address on their profile."],
    };
  }

  const oldestHours = Math.max(...waiting.map((r) => hoursWaiting(r, now)));

  const rows = waiting
    .map((r) => {
      const hours = hoursWaiting(r, now);
      /* The delivery state of the ORIGINAL alert is carried into the chase on purpose. If the
         first email never reached him, that is the fact he needs, not a repeated summary. */
      const missed = r.founder_alerted_at
        ? ""
        : `<div style="color:#e0a33e;font-size:12px;">${escapeHtml(
            r.founder_alert_error
              ? `The first alert did not send: ${r.founder_alert_error}`
              : "No alert was recorded for this one.",
          )}</div>`;
      return `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #2a3145;">
          <div style="color:#e9ecf5;font-weight:600;">${escapeHtml(r.company_name)}</div>
          <div style="color:#8b93a7;font-size:13px;">${escapeHtml(r.contact_name)} · ${escapeHtml(r.email)}</div>
          ${missed}
        </td><td style="padding:8px 0;border-top:1px solid #2a3145;color:${
          hours >= 24 ? "#e06666" : "#8b93a7"
        };white-space:nowrap;">${escapeHtml(waitingLabel(hours))}</td></tr>`;
    })
    .join("");

  const bodyHtml = `<p>${escapeHtml(chaseOpening(waiting.length, oldestHours))}</p>
    <table style="border-collapse:collapse;font-size:14px;width:100%;">${rows}</table>
    <p style="color:#8b93a7;font-size:13px;">${escapeHtml(CHASE_FOOTER)}</p>`;

  const html = noticeEmailHtml({
    preheader: chaseSubject(waiting.length, oldestHours),
    heading: "Trial requests waiting for you",
    bodyHtml,
    ctaLabel: "Open the trial requests",
    ctaUrl: `${siteUrl()}/founder/trial-requests`,
    footerNote: "You receive this because you are the platform admin for Be Care Compliant.",
  });

  let sent = false;
  for (const to of recipients) {
    const result = await sendEmail({
      to,
      subject: chaseSubject(waiting.length, oldestHours),
      html,
    });
    if (result.sent) sent = true;
    else errors.push(`${to}: ${result.error ?? result.skippedReason ?? "unknown send failure"}`);
  }

  /* ONLY stamp when something actually left. A chase that failed to send must be tried again
     tomorrow, not marked as done — that is the exact mistake this whole change is fixing. */
  if (sent) {
    const stamped = new Date().toISOString();
    for (const r of waiting) {
      const { error: upErr } = await supabase
        .from("trial_requests")
        .update({
          founder_chased_at: stamped,
          founder_chase_count: (r.founder_chase_count ?? 0) + 1,
        })
        .eq("id", r.id);
      if (upErr) errors.push(`stamp ${r.id}: ${upErr.message}`);
    }
  }

  return { waiting: waiting.length, sent, errors };
}
