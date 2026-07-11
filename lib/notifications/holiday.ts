import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml, formatDateUk } from "@/lib/email/templates";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { siteUrl } from "@/lib/site";

/**
 * Holiday notification emails (Phase 6, the flow owed from Holidays):
 *  - request submitted  -> every approver (branch Managers + Company Admins)
 *  - request decided    -> the requester
 * Idempotent via notification_log; silently no-op when Resend is missing (the
 * caller's audit metadata records the outcome). Best-effort: a failed email
 * never blocks the holiday action itself.
 */

type Outcome = Record<string, string>;

export async function notifyHolidayRequested(opts: {
  companyId: string;
  branchId: string | null;
  requestId: string;
  requesterName: string;
  startDate: string;
  endDate: string;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    const supabase = createServiceClient();
    const [{ data: admins }, { data: company }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("company_id", opts.companyId)
        .eq("status", "active")
        .in("role", ["company_admin", "manager"]),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);

    // Managers only for the request's branch; Admins always.
    let approvers = admins ?? [];
    if (opts.branchId) {
      const managerIds = approvers.filter((a) => a.role === "manager").map((a) => a.id);
      if (managerIds.length > 0) {
        const { data: branchRows } = await supabase
          .from("user_branches")
          .select("user_id")
          .eq("branch_id", opts.branchId)
          .in("user_id", managerIds);
        const inBranch = new Set((branchRows ?? []).map((r) => r.user_id));
        approvers = approvers.filter((a) => a.role === "company_admin" || inBranch.has(a.id));
      }
    }

    for (const approver of approvers) {
      if (!approver.email) continue;
      const logId = await claimNotification({
        companyId: opts.companyId,
        branchId: opts.branchId,
        recipientProfileId: approver.id,
        channel: "email",
        kind: "holiday_request",
        dedupeKey: `holiday_request:${opts.requestId}:${approver.id}`,
        toAddress: approver.email,
        subject: `Holiday request from ${opts.requesterName}`,
      });
      if (!logId) {
        outcomes[approver.email] = "already_sent";
        continue;
      }
      const result = await sendEmail({
        to: approver.email,
        subject: `Holiday request from ${opts.requesterName}`,
        html: noticeEmailHtml({
          preheader: `${opts.requesterName} has requested holiday.`,
          heading: "A holiday request needs a decision",
          bodyHtml: `<p style="margin:0;"><strong style="color:#ffffff;">${escapeHtml(opts.requesterName)}</strong> has requested holiday from
            <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to
            <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>
            at ${escapeHtml(company?.name ?? "your company")}. Please approve or decline it in the Holiday section.</p>`,
          ctaLabel: "Review the request",
          ctaUrl: `${siteUrl()}/people/holiday`,
        }),
      });
      outcomes[approver.email] = result.sent
        ? "sent"
        : result.skippedReason
          ? "skipped_no_email_config"
          : `failed: ${result.error}`;
      await settleNotification(
        logId,
        result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
        result.error ?? result.skippedReason,
      );
    }
  } catch (e) {
    outcomes.error = (e as Error).message;
  }
  return outcomes;
}

export async function notifyHolidayDecided(opts: {
  companyId: string;
  branchId: string | null;
  requestId: string;
  requestedBy: string | null;
  status: "approved" | "declined";
  startDate: string;
  endDate: string;
  note?: string | null;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    if (!opts.requestedBy) return { requester: "skipped_no_requester" };
    const supabase = createServiceClient();
    const [{ data: requester }, { data: company }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("id", opts.requestedBy).maybeSingle(),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);
    if (!requester?.email) return { requester: "skipped_no_email" };

    const approved = opts.status === "approved";
    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: opts.branchId,
      recipientProfileId: requester.id,
      channel: "email",
      kind: "holiday_decision",
      dedupeKey: `holiday_decision:${opts.requestId}`,
      toAddress: requester.email,
      subject: approved ? "Your holiday request is approved" : "Your holiday request was declined",
    });
    if (!logId) return { requester: "already_sent" };

    const noteHtml =
      !approved && opts.note
        ? `<p style="margin:12px 0 0 0;">Reason given: ${escapeHtml(opts.note)}</p>`
        : "";
    const result = await sendEmail({
      to: requester.email,
      subject: approved ? "Your holiday request is approved" : "Your holiday request was declined",
      html: noticeEmailHtml({
        preheader: approved ? "Your holiday is booked." : "Your holiday request was declined.",
        heading: approved ? "Holiday approved" : "Holiday declined",
        bodyHtml: `<p style="margin:0;">${escapeHtml(requester.full_name || "Hello")}, your holiday request from
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>
          at ${escapeHtml(company?.name ?? "your company")} has been
          <strong style="color:${approved ? "#86efac" : "#fca5a5"};">${approved ? "approved" : "declined"}</strong>.</p>${noteHtml}`,
        ctaLabel: "View your holidays",
        ctaUrl: `${siteUrl()}/people/holiday`,
      }),
    });
    outcomes.requester = result.sent
      ? "sent"
      : result.skippedReason
        ? "skipped_no_email_config"
        : `failed: ${result.error}`;
    await settleNotification(
      logId,
      result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
      result.error ?? result.skippedReason,
    );
  } catch (e) {
    outcomes.error = (e as Error).message;
  }
  return outcomes;
}
