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
        .in("role", ["company_admin", "registered_individual", "registered_manager", "manager"]),
      supabase.from("companies").select("name, holiday_request_emails_enabled").eq("id", opts.companyId).maybeSingle(),
    ]);

    // Phil, 2026-08-11: a company can silence the "request submitted" approver email
    // (companies.holiday_request_emails_enabled=false). The request, its approval flow
    // and the decision email to the requester are unaffected — only this notice is held.
    if (company?.holiday_request_emails_enabled === false) {
      outcomes.disabled = "holiday_request_emails_disabled_for_company";
      return outcomes;
    }

    // Branch Managers only for the request's branch; company wide roles always.
    // Registered Individual and Registered Manager are company wide like an Admin.
    const companyWide = new Set(["company_admin", "registered_individual", "registered_manager"]);
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
        approvers = approvers.filter((a) => companyWide.has(a.role as string) || inBranch.has(a.id));
      }
    } else {
      // A request with no branch belongs to no branch, so after 0206 a Branch
      // Manager can neither see it on the Holiday page nor decide it. Emailing
      // them a request they cannot act on is worse than not emailing them.
      approvers = approvers.filter((a) => companyWide.has(a.role as string));
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
  /** A request sent through a public form has no account behind it, so there is
   *  no profile to email. The address the person gave on the form is used
   *  instead, so they still hear the outcome. */
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    if (!opts.requestedBy && !opts.fallbackEmail) {
      return { requester: "skipped_no_requester" };
    }
    const supabase = createServiceClient();
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", opts.companyId)
      .maybeSingle();

    let requester: { id: string; full_name: string; email: string } | null = null;
    if (opts.requestedBy) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", opts.requestedBy)
        .maybeSingle();
      requester = (data as { id: string; full_name: string; email: string } | null) ?? null;
    }

    const toAddress = requester?.email ?? opts.fallbackEmail ?? null;
    const toName = requester?.full_name ?? opts.fallbackName ?? "";
    if (!toAddress) return { requester: "skipped_no_email" };

    const approved = opts.status === "approved";
    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: opts.branchId,
      recipientProfileId: requester?.id ?? null,
      channel: "email",
      kind: "holiday_decision",
      dedupeKey: `holiday_decision:${opts.requestId}`,
      toAddress,
      subject: approved ? "Your holiday request is approved" : "Your holiday request was declined",
    });
    if (!logId) return { requester: "already_sent" };

    const noteHtml =
      !approved && opts.note
        ? `<p style="margin:12px 0 0 0;">Reason given: ${escapeHtml(opts.note)}</p>`
        : "";
    const result = await sendEmail({
      to: toAddress,
      subject: approved ? "Your holiday request is approved" : "Your holiday request was declined",
      html: noticeEmailHtml({
        preheader: approved ? "Your holiday is booked." : "Your holiday request was declined.",
        heading: approved ? "Holiday approved" : "Holiday declined",
        bodyHtml: `<p style="margin:0;">${escapeHtml(toName || "Hello")}, your holiday request from
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>
          at ${escapeHtml(company?.name ?? "your company")} has been
          <strong style="color:${approved ? "#86efac" : "#fca5a5"};">${approved ? "approved" : "declined"}</strong>.</p>${noteHtml}`,
        // No account, no CTA: a public form submitter has nowhere to log in to.
        ctaLabel: requester ? "View your holidays" : undefined,
        ctaUrl: requester ? `${siteUrl()}/people/holiday` : undefined,
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

/**
 * Tell the person their holiday changed after it was decided: cancelled, or its
 * dates corrected. Same rules as the decision email, so a public form submitter
 * with no account still hears about it at the address they gave, without a CTA
 * button they cannot use.
 */
export async function notifyHolidayChanged(opts: {
  companyId: string;
  branchId: string | null;
  requestId: string;
  requestedBy: string | null;
  kind: "cancelled" | "amended";
  startDate: string;
  endDate: string;
  /** Cancellation reason, or the dates it was moved from. */
  note?: string | null;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    if (!opts.requestedBy && !opts.fallbackEmail) {
      return { requester: "skipped_no_requester" };
    }
    const supabase = createServiceClient();
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", opts.companyId)
      .maybeSingle();

    let requester: { id: string; full_name: string; email: string } | null = null;
    if (opts.requestedBy) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", opts.requestedBy)
        .maybeSingle();
      requester = (data as { id: string; full_name: string; email: string } | null) ?? null;
    }

    const toAddress = requester?.email ?? opts.fallbackEmail ?? null;
    const toName = requester?.full_name ?? opts.fallbackName ?? "";
    if (!toAddress) return { requester: "skipped_no_email" };

    const cancelled = opts.kind === "cancelled";
    const subject = cancelled ? "Your holiday has been cancelled" : "Your holiday dates have changed";
    // The dedupe key carries the kind AND the dates, so a second genuine change
    // still sends while an accidental double submit does not.
    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: opts.branchId,
      recipientProfileId: requester?.id ?? null,
      channel: "email",
      kind: cancelled ? "holiday_cancelled" : "holiday_amended",
      dedupeKey: `holiday_${opts.kind}:${opts.requestId}:${opts.startDate}:${opts.endDate}`,
      toAddress,
      subject,
    });
    if (!logId) return { requester: "already_sent" };

    const noteHtml = opts.note
      ? `<p style="margin:12px 0 0 0;">${escapeHtml(opts.note)}</p>`
      : "";
    const result = await sendEmail({
      to: toAddress,
      subject,
      html: noticeEmailHtml({
        preheader: cancelled ? "Your holiday has been cancelled." : "Your holiday dates have changed.",
        heading: cancelled ? "Holiday cancelled" : "Holiday dates changed",
        bodyHtml: `<p style="margin:0;">${escapeHtml(toName || "Hello")}, your holiday at
          ${escapeHtml(company?.name ?? "your company")} ${cancelled ? "has been cancelled" : "now runs"}
          ${cancelled ? "" : `from <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>`}.
          ${cancelled ? `It was booked from <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>.` : ""}
          Please speak to your manager if this is not what you expected.</p>${noteHtml}`,
        ctaLabel: requester ? "View your holidays" : undefined,
        ctaUrl: requester ? `${siteUrl()}/people/holiday` : undefined,
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
