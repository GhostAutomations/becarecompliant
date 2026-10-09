import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml, formatDateUk } from "@/lib/email/templates";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { siteUrl } from "@/lib/site";
import { HOLIDAY_APPROVER_ROLES, holidayApprovers } from "@/lib/notifications/roles";
import { isCarerLogin } from "@/lib/auth/carer-login";

/**
 * Holiday notification emails (Phase 6, the flow owed from Holidays):
 *  - request submitted  -> every approver (branch Managers + Company Admins)
 *  - request decided    -> the person whose holiday it is
 *  - changed by the office, or a change or cancellation the carer asked for decided -> that person
 *  - a change or cancellation asked for by the carer (0438) -> every approver
 * Idempotent via notification_log; silently no-op when Resend is missing (the
 * caller's audit metadata records the outcome). Best-effort: a failed email
 * never blocks the holiday action itself.
 */

type Outcome = Record<string, string>;
type Db = ReturnType<typeof createServiceClient>;

type Approver = { id: string; full_name: string | null; email: string | null; role: string };

/**
 * Who decides a request in this branch, and whether the company has silenced request emails.
 * One list for the first request and for every change asked for afterwards.
 */
async function loadApprovers(
  supabase: Db,
  companyId: string,
  branchId: string | null,
): Promise<{ approvers: Approver[]; companyName: string | null; emailsEnabled: boolean }> {
  const [{ data: admins }, { data: company }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("company_id", companyId)
      .eq("status", "active")
      .in("role", HOLIDAY_APPROVER_ROLES),
    supabase.from("companies").select("name, holiday_request_emails_enabled").eq("id", companyId).maybeSingle(),
  ]);

  // Phil, 2026-08-11: a company can silence the "request submitted" approver email
  // (companies.holiday_request_emails_enabled=false). The request, its approval flow
  // and the decision email to the requester are unaffected — only this notice is held.
  const emailsEnabled = company?.holiday_request_emails_enabled !== false;
  if (!emailsEnabled) {
    return { approvers: [], companyName: (company?.name as string | null) ?? null, emailsEnabled };
  }

  // Branch Managers only for the request's branch; company wide roles always.
  // The rule itself is in ./roles.ts, with tests: a request with NO branch
  // belongs to no branch, so after migration 0206 a Branch Manager can
  // neither see it on the Holiday page nor decide it, and emailing them one
  // is worse than silence.
  const candidates = admins ?? [];
  let managerIdsInBranch: string[] = [];
  if (branchId) {
    const managerIds = candidates.filter((a) => a.role === "manager").map((a) => a.id);
    if (managerIds.length > 0) {
      const { data: branchRows } = await supabase
        .from("user_branches")
        .select("user_id")
        .eq("branch_id", branchId)
        .in("user_id", managerIds);
      managerIdsInBranch = (branchRows ?? []).map((r) => r.user_id as string);
    }
  }
  const approvers = holidayApprovers({
    branchId,
    candidates: candidates.map((a) => ({ ...a, id: a.id as string, role: a.role as string })),
    managerIdsInBranch,
  }) as Approver[];
  return { approvers, companyName: (company?.name as string | null) ?? null, emailsEnabled };
}

type HolidayPerson = {
  profileId: string | null;
  name: string;
  email: string | null;
  /** A carer login (staff or senior), whose holidays are in My area, not the office Holiday page. */
  carer: boolean;
  hasAccount: boolean;
};

/**
 * Who to tell about their own holiday: the login of the person it is for, then whoever asked for
 * it, then, for a public form with no account behind it, the address given on the form.
 *
 * Phil, 2026-10-09: a holiday the office booked FOR a carer is the carer's, so the carer is the one
 * told when it is decided or changed. It used to go to whoever filled the booking in.
 */
async function loadHolidayPerson(supabase: Db, requestId: string): Promise<HolidayPerson> {
  const { data: req } = await supabase
    .from("holiday_requests")
    .select("person_id, requested_by")
    .eq("id", requestId)
    .maybeSingle();
  let profileId: string | null = null;
  if (req?.person_id) {
    const { data: pe } = await supabase
      .from("people")
      .select("profile_id")
      .eq("id", req.person_id as string)
      .maybeSingle();
    profileId = (pe?.profile_id as string | null) ?? null;
  }
  if (!profileId) profileId = (req?.requested_by as string | null) ?? null;
  if (profileId) {
    const { data: p } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", profileId)
      .maybeSingle();
    if (p?.email) {
      return {
        profileId: p.id as string,
        name: (p.full_name as string | null) ?? "",
        email: p.email as string,
        carer: isCarerLogin(p.role as string | null),
        hasAccount: true,
      };
    }
  }
  if (req?.requested_by) {
    // An account with no email cannot be written to, and is not a public form either.
    return { profileId, name: "", email: null, carer: false, hasAccount: true };
  }
  const { data: sub } = await supabase
    .from("public_form_submissions")
    .select("submitted_email, submitted_name")
    .eq("holiday_request_id", requestId)
    .maybeSingle();
  return {
    profileId: null,
    name: (sub?.submitted_name as string | null) ?? "",
    email: (sub?.submitted_email as string | null) ?? null,
    carer: false,
    hasAccount: false,
  };
}

/** The button for someone with an account: a carer to My area, anyone else to Holiday. No account,
 *  no button: a public form submitter has nowhere to sign in. */
function holidayButton(person: HolidayPerson): { ctaLabel?: string; ctaUrl?: string } {
  if (!person.hasAccount) return {};
  return {
    ctaLabel: "View your holidays",
    ctaUrl: `${siteUrl()}${person.carer ? "/my" : "/people/holiday"}`,
  };
}

function strong(text: string): string {
  return `<strong style="color:#ffffff;">${escapeHtml(text)}</strong>`;
}

function range(start: string, end: string): string {
  return start === end
    ? strong(formatDateUk(start))
    : `${strong(formatDateUk(start))} to ${strong(formatDateUk(end))}`;
}

function paragraph(html: string, first = false): string {
  return `<p style="margin:${first ? "0" : "12px 0 0 0"};">${html}</p>`;
}

function settled(result: { sent: boolean; skippedReason?: string; error?: string }): string {
  return result.sent ? "sent" : result.skippedReason ? "skipped_no_email_config" : `failed: ${result.error}`;
}

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
    const { approvers, companyName, emailsEnabled } = await loadApprovers(
      supabase,
      opts.companyId,
      opts.branchId,
    );
    if (!emailsEnabled) {
      outcomes.disabled = "holiday_request_emails_disabled_for_company";
      return outcomes;
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
      const result = await sendEmail({ companyId: opts.companyId,
        to: approver.email,
        subject: `Holiday request from ${opts.requesterName}`,
        html: noticeEmailHtml({
          preheader: `${opts.requesterName} has requested holiday.`,
          heading: "A holiday request needs a decision",
          bodyHtml: `<p style="margin:0;"><strong style="color:#ffffff;">${escapeHtml(opts.requesterName)}</strong> has requested holiday from
            <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to
            <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>
            at ${escapeHtml(companyName ?? "your company")}. Please approve or decline it in the Holiday section.</p>`,
          ctaLabel: "Review the request",
          ctaUrl: `${siteUrl()}/people/holiday`,
        }),
      });
      outcomes[approver.email] = settled(result);
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

/**
 * A carer asked to change or cancel their holiday (0438): every approver is told, under the same
 * switch as a new request. One email per history row and approver, so a double press is one email
 * and a genuine second change is another.
 */
export async function notifyHolidayChangeRequested(opts: {
  companyId: string;
  branchId: string | null;
  requestId: string;
  /** The holiday_request_events row this email is about. */
  eventId: string;
  requesterName: string;
  /** change: an approved holiday back to pending on new dates. cancel: a cancellation request.
   *  request_amended: a request not yet decided, now asking for different dates. */
  kind: "change" | "cancel" | "request_amended";
  oldStart: string;
  oldEnd: string;
  newStart?: string | null;
  newEnd?: string | null;
  reason: string;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    const supabase = createServiceClient();
    const { approvers, companyName, emailsEnabled } = await loadApprovers(
      supabase,
      opts.companyId,
      opts.branchId,
    );
    if (!emailsEnabled) {
      outcomes.disabled = "holiday_request_emails_disabled_for_company";
      return outcomes;
    }

    const who = strong(opts.requesterName);
    const company = escapeHtml(companyName ?? "your company");
    const reason = paragraph(`Reason given: ${escapeHtml(opts.reason)}`);
    let subject: string;
    let heading: string;
    let body: string;
    if (opts.kind === "cancel") {
      subject = `Cancellation request from ${opts.requesterName}`;
      heading = "A cancellation request needs a decision";
      body =
        paragraph(`${who} has asked to cancel their holiday from ${range(opts.oldStart, opts.oldEnd)} at ${company}.`, true) +
        reason +
        paragraph("It is in Pending requests until you approve or decline it. If you decline, the holiday stays booked.");
    } else if (opts.kind === "change") {
      subject = `Change of holiday from ${opts.requesterName}`;
      heading = "A change of holiday needs a decision";
      body =
        paragraph(`${who} has asked to change their approved holiday at ${company}. It was booked from ${range(opts.oldStart, opts.oldEnd)}, and they now ask for ${range(opts.newStart ?? opts.oldStart, opts.newEnd ?? opts.oldEnd)}.`, true) +
        reason +
        paragraph("It is back in Pending requests until you approve or decline it. If you decline, the dates first agreed stand.");
    } else {
      subject = `Holiday request changed by ${opts.requesterName}`;
      heading = "A holiday request has new dates";
      body =
        paragraph(`${who} has changed the dates of their holiday request at ${company}. It was ${range(opts.oldStart, opts.oldEnd)}, and it is now ${range(opts.newStart ?? opts.oldStart, opts.newEnd ?? opts.oldEnd)}.`, true) +
        reason +
        paragraph("Please approve or decline it in the Holiday section.");
    }

    for (const approver of approvers) {
      if (!approver.email) continue;
      const logId = await claimNotification({
        companyId: opts.companyId,
        branchId: opts.branchId,
        recipientProfileId: approver.id,
        channel: "email",
        kind: "holiday_change_request",
        dedupeKey: `holiday_event:${opts.eventId}:${approver.id}`,
        toAddress: approver.email,
        subject,
      });
      if (!logId) {
        outcomes[approver.email] = "already_sent";
        continue;
      }
      const result = await sendEmail({
        companyId: opts.companyId,
        to: approver.email,
        subject,
        html: noticeEmailHtml({
          preheader: subject,
          heading,
          bodyHtml: body,
          ctaLabel: "Review the request",
          ctaUrl: `${siteUrl()}/people/holiday`,
        }),
      });
      outcomes[approver.email] = settled(result);
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
  status: "approved" | "declined";
  startDate: string;
  endDate: string;
  note?: string | null;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    const supabase = createServiceClient();
    const [person, { data: company }] = await Promise.all([
      loadHolidayPerson(supabase, opts.requestId),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);
    if (!person.email) {
      return { requester: person.hasAccount ? "skipped_no_email" : "skipped_no_requester" };
    }

    const approved = opts.status === "approved";
    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: opts.branchId,
      recipientProfileId: person.profileId,
      channel: "email",
      kind: "holiday_decision",
      dedupeKey: `holiday_decision:${opts.requestId}`,
      toAddress: person.email,
      subject: approved ? "Your holiday request is approved" : "Your holiday request was declined",
    });
    if (!logId) return { requester: "already_sent" };

    const noteHtml =
      !approved && opts.note
        ? `<p style="margin:12px 0 0 0;">Reason given: ${escapeHtml(opts.note)}</p>`
        : "";
    const result = await sendEmail({ companyId: opts.companyId,
      to: person.email,
      subject: approved ? "Your holiday request is approved" : "Your holiday request was declined",
      html: noticeEmailHtml({
        preheader: approved ? "Your holiday is booked." : "Your holiday request was declined.",
        heading: approved ? "Holiday approved" : "Holiday declined",
        bodyHtml: `<p style="margin:0;">${escapeHtml(person.name || "Hello")}, your holiday request from
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.startDate))}</strong> to
          <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.endDate))}</strong>
          at ${escapeHtml((company?.name as string | null) ?? "your company")} has been
          <strong style="color:${approved ? "#86efac" : "#fca5a5"};">${approved ? "approved" : "declined"}</strong>.</p>${noteHtml}`,
        ...holidayButton(person),
      }),
    });
    outcomes.requester = settled(result);
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
 * dates corrected by the office. Same rules as the decision email, so a public form
 * submitter with no account still hears about it at the address they gave, without
 * a CTA button they cannot use. Nobody is emailed about a change they made themselves.
 */
export async function notifyHolidayChanged(opts: {
  companyId: string;
  branchId: string | null;
  requestId: string;
  /** Who made the change: they are not told about their own change. */
  actorId?: string | null;
  kind: "cancelled" | "amended";
  startDate: string;
  endDate: string;
  /** For an amend, the dates it was moved from. */
  previousStart?: string | null;
  previousEnd?: string | null;
  /** The reason the office gave (0438: required for every change). */
  reason?: string | null;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    const supabase = createServiceClient();
    const [person, { data: company }] = await Promise.all([
      loadHolidayPerson(supabase, opts.requestId),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);
    if (!person.email) {
      return { requester: person.hasAccount ? "skipped_no_email" : "skipped_no_requester" };
    }
    if (opts.actorId && person.profileId === opts.actorId) {
      return { requester: "skipped_own_change" };
    }

    const cancelled = opts.kind === "cancelled";
    const subject = cancelled ? "Your holiday has been cancelled" : "Your holiday dates have changed";
    // The dedupe key carries the kind AND the dates, so a second genuine change
    // still sends while an accidental double submit does not.
    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: opts.branchId,
      recipientProfileId: person.profileId,
      channel: "email",
      kind: cancelled ? "holiday_cancelled" : "holiday_amended",
      dedupeKey: `holiday_${opts.kind}:${opts.requestId}:${opts.startDate}:${opts.endDate}`,
      toAddress: person.email,
      subject,
    });
    if (!logId) return { requester: "already_sent" };

    const companyName = escapeHtml((company?.name as string | null) ?? "your company");
    const hello = escapeHtml(person.name || "Hello");
    let body = cancelled
      ? paragraph(`${hello}, your holiday at ${companyName} from ${range(opts.startDate, opts.endDate)} has been cancelled.`, true)
      : paragraph(`${hello}, your holiday at ${companyName} now runs from ${range(opts.startDate, opts.endDate)}.`, true);
    if (!cancelled && opts.previousStart && opts.previousEnd) {
      body += paragraph(`It was previously booked from ${range(opts.previousStart, opts.previousEnd)}.`);
    }
    if (opts.reason) body += paragraph(`Reason given: ${escapeHtml(opts.reason)}`);
    body += paragraph("Please speak to your manager if this is not what you expected.");

    const result = await sendEmail({ companyId: opts.companyId,
      to: person.email,
      subject,
      html: noticeEmailHtml({
        preheader: cancelled ? "Your holiday has been cancelled." : "Your holiday dates have changed.",
        heading: cancelled ? "Holiday cancelled" : "Holiday dates changed",
        bodyHtml: body,
        ...holidayButton(person),
      }),
    });
    outcomes.requester = settled(result);
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
 * The office decided a change or cancellation the carer asked for (0438): tell the carer.
 */
export async function notifyHolidayChangeDecided(opts: {
  companyId: string;
  branchId: string | null;
  requestId: string;
  eventId: string;
  actorId?: string | null;
  kind: "change_approved" | "change_declined" | "cancel_approved" | "cancel_declined";
  /** The holiday as it now stands. */
  startDate: string;
  endDate: string;
  /** For a change: the dates asked for (declined) or the dates before (approved). */
  otherStart?: string | null;
  otherEnd?: string | null;
  note?: string | null;
}): Promise<Outcome> {
  const outcomes: Outcome = {};
  try {
    const supabase = createServiceClient();
    const [person, { data: company }] = await Promise.all([
      loadHolidayPerson(supabase, opts.requestId),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);
    if (!person.email) {
      return { requester: person.hasAccount ? "skipped_no_email" : "skipped_no_requester" };
    }
    if (opts.actorId && person.profileId === opts.actorId) {
      return { requester: "skipped_own_change" };
    }

    const companyName = escapeHtml((company?.name as string | null) ?? "your company");
    const hello = escapeHtml(person.name || "Hello");
    const now = range(opts.startDate, opts.endDate);
    const other = opts.otherStart && opts.otherEnd ? range(opts.otherStart, opts.otherEnd) : "";
    let subject: string;
    let heading: string;
    let body: string;
    switch (opts.kind) {
      case "change_approved":
        subject = "Your change of holiday is approved";
        heading = "Change of holiday approved";
        body = paragraph(`${hello}, your change of holiday at ${companyName} is approved. Your holiday now runs from ${now}.`, true);
        break;
      case "change_declined":
        subject = "Your change of holiday was declined";
        heading = "Change of holiday declined";
        body =
          paragraph(`${hello}, your change of holiday at ${companyName} was declined, so your holiday stays from ${now}, as first agreed.`, true) +
          (other ? paragraph(`You had asked for ${other}.`) : "");
        break;
      case "cancel_approved":
        subject = "Your holiday is cancelled";
        heading = "Holiday cancelled, as you asked";
        body = paragraph(`${hello}, your holiday at ${companyName} from ${now} is cancelled, as you asked.`, true);
        break;
      default:
        subject = "Your request to cancel your holiday was declined";
        heading = "Your holiday stays booked";
        body = paragraph(`${hello}, your request to cancel your holiday at ${companyName} was declined, so your holiday from ${now} is still booked.`, true);
        break;
    }
    if (opts.note) body += paragraph(`Reason given: ${escapeHtml(opts.note)}`);

    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: opts.branchId,
      recipientProfileId: person.profileId,
      channel: "email",
      kind: "holiday_change_decision",
      dedupeKey: `holiday_event:${opts.eventId}:person`,
      toAddress: person.email,
      subject,
    });
    if (!logId) return { requester: "already_sent" };

    const result = await sendEmail({
      companyId: opts.companyId,
      to: person.email,
      subject,
      html: noticeEmailHtml({ preheader: subject, heading, bodyHtml: body, ...holidayButton(person) }),
    });
    outcomes.requester = settled(result);
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
