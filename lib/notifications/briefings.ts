import "server-only";

/**
 * Be Care Compliant — briefing emails.
 *
 * Phil, 2026-07-26: "briefing emails not sending". They were not: Briefings
 * shipped with the in-app list and the signing, and nothing ever told the person
 * a briefing was waiting. This is that missing piece, and it follows the Phase 6
 * spine exactly, so it inherits everything that was already proven:
 *
 *   claim a dedupe key in notification_log FIRST  -> a retry can never resend
 *   send through lib/email/resend                  -> branded shell, CTA button
 *   settle the log row                             -> the send is auditable
 *
 * Three emails:
 *   notifyBriefingSent     — the moment a Manager sends it (one per person)
 *   briefingChasesForToday — a Team Member's own reminder once it is due
 *   managerOutstanding     — a Manager's list of who has not signed, overdue only
 *
 * Nobody is emailed twice for the same thing on the same day, and a person with
 * no email address on their record is counted and reported back to the Manager
 * rather than failing silently.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isSendableAddress, sendEmailBatch } from "@/lib/email/resend";
import { TEST_COMPANY_NO_MESSAGES } from "@/lib/email/muted";
import { escapeHtml, formatDateUk, noticeEmailHtml } from "@/lib/email/templates";
import { claimNotification, settleNotifications } from "@/lib/notifications/log";
import { siteUrl } from "@/lib/site";
import {
  NOTICE_KIND_LABELS,
  noticeSubject,
  type NoticeKind,
  type NoticeResponse,
} from "@/lib/briefings/notice-rules";

export type BriefingSendOutcome = {
  /** Emails handed to Resend successfully. */
  emailed: number;
  /** People with no email address on their record. */
  noEmail: number;
  /** Attempted and failed, or skipped because email is not configured. */
  failed: number;
  /** Already emailed about this exact briefing (a re-send of the same rows). */
  alreadySent: number;
  /** Not sent because messages are switched off for this test company. Also counted in failed. */
  muted: number;
};

type PersonRow = {
  id: string;
  full_name: string;
  work_email: string | null;
  profile_id: string | null;
  branch_id: string | null;
};

/** An outstanding briefing, flattened for the digest. */
export type OutstandingBriefing = {
  assignmentId: string;
  kind: "form" | "policy" | "notice";
  title: string;
  dueDate: string | null;
  personId: string;
  personName: string;
  personEmail: string | null;
  personProfileId: string | null;
  branchId: string | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type NoticeInfo = {
  kind: NoticeKind;
  response: NoticeResponse;
  fileCount: number;
  /** "Jane Smith, Registered Manager" when sent on someone's behalf (0436). */
  from?: string | null;
};

function subjectFor(kind: "form" | "policy" | "notice", title: string, notice?: NoticeInfo): string {
  if (kind === "notice" && notice) return noticeSubject(notice.kind, notice.response, title);
  return kind === "policy" ? `Please read and sign: ${title}` : `Please complete: ${title}`;
}

/** What a memo, message or attachment email says. The words stay in Be Care Compliant: the email
 *  only says it is there, so opening it is what counts as reading it, and nothing about the team
 *  sits in an inbox. */
function noticeEmailParts(notice: NoticeInfo, title: string): { what: string; heading: string; preheader: string; how: string } {
  const thing = notice.kind === "attachment" ? "some documents" : `a ${NOTICE_KIND_LABELS[notice.kind].toLowerCase()}`;
  const t = `<strong style="color:#ffffff;">${escapeHtml(title)}</strong>`;
  const files = notice.fileCount > 0 ? ` It comes with ${notice.fileCount === 1 ? "a file" : `${notice.fileCount} files`}.` : "";
  if (notice.response === "sign") {
    return {
      what: `read and sign ${thing}, ${t}`,
      heading: "Something to read and sign",
      preheader: `${title} is waiting for your signature.`,
      how: `${HOW_TO_SIGN}${files}`,
    };
  }
  if (notice.response === "confirm") {
    return {
      what: `read ${thing}, ${t}, and confirm you have read it`,
      heading: "Something to read and confirm",
      preheader: `${title} is waiting for you to read.`,
      how: `Open it, read it, and press "I have read this".${files}`,
    };
  }
  return {
    what: `read ${thing}, ${t}`,
    heading: notice.kind === "memo" ? "A new memo" : notice.kind === "message" ? "A new message" : "Documents for you",
    preheader: `${title} is waiting for you to read.`,
    how: `Open it on your phone or a computer.${files}`,
  };
}

/**
 * The reassurance sentence. Phil, 2026-07-26: "are we issuing a pdf that they
 * need an app for to sign it becasue that is not what i want." They do not, and
 * the email has to say so, or somebody will print it.
 */
const HOW_TO_SIGN =
  "You sign it on screen, on your phone or a computer. There is nothing to download, print or post.";

/** Email everyone a briefing has just been sent to. Best effort: never blocks the send. */
export async function notifyBriefingSent(opts: {
  companyId: string;
  kind: "form" | "policy" | "notice";
  title: string;
  /** For a memo, message or attachment. */
  notice?: NoticeInfo;
  dueDate: string | null;
  assignments: Array<{ id: string; personId: string }>;
}): Promise<BriefingSendOutcome> {
  const outcome: BriefingSendOutcome = { emailed: 0, noEmail: 0, failed: 0, alreadySent: 0, muted: 0 };
  if (opts.assignments.length === 0) return outcome;

  try {
    const supabase = createServiceClient();
    const personIds = [...new Set(opts.assignments.map((a) => a.personId))];
    const [{ data: peopleRows }, { data: company }] = await Promise.all([
      supabase
        .from("people")
        .select("id, full_name, work_email, profile_id, branch_id")
        .in("id", personIds),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);
    const byId = new Map(((peopleRows ?? []) as PersonRow[]).map((p) => [p.id, p]));
    const companyName = (company?.name as string | null) ?? "your company";
    const subject = subjectFor(opts.kind, opts.title, opts.notice);
    const noticeParts = opts.kind === "notice" && opts.notice ? noticeEmailParts(opts.notice, opts.title) : null;

    // Who can actually be emailed.
    const targets: Array<{ assignmentId: string; person: PersonRow }> = [];
    for (const a of opts.assignments) {
      const person = byId.get(a.personId);
      if (!person) continue;
      if (!isSendableAddress(person.work_email)) {
        // No address, or a demo/reserved one that must never be posted to.
        outcome.noEmail += 1;
        continue;
      }
      targets.push({ assignmentId: a.id, person });
    }
    if (targets.length === 0) return outcome;

    // Claim every dedupe key first, in parallel: the assignment id is in the key,
    // so re-sending the same briefing to somebody never emails them twice.
    const claims = await Promise.all(
      targets.map((t) =>
        claimNotification({
          companyId: opts.companyId,
          branchId: t.person.branch_id,
          recipientProfileId: t.person.profile_id,
          channel: "email",
          kind: "briefing_sent",
          dedupeKey: `briefing_sent:${t.assignmentId}`,
          toAddress: t.person.work_email as string,
          subject,
          metadata: { kind: opts.kind, title: opts.title, person_id: t.person.id },
        }),
      ),
    );

    const toSend: Array<{ logId: string; to: string; subject: string; html: string }> = [];
    claims.forEach((logId, i) => {
      if (!logId) {
        outcome.alreadySent += 1;
        return;
      }
      const person = targets[i].person;
      const hasLogin = Boolean(person.profile_id);
      const due = opts.dueDate
        ? ` Please do it by <strong style="color:#ffffff;">${escapeHtml(formatDateUk(opts.dueDate))}</strong>.`
        : "";
      const how = noticeParts?.how ?? HOW_TO_SIGN;
      const what = noticeParts
        ? noticeParts.what
        : opts.kind === "policy"
          ? `read and sign <strong style="color:#ffffff;">${escapeHtml(opts.title)}</strong>`
          : `complete the form <strong style="color:#ffffff;">${escapeHtml(opts.title)}</strong>`;
      toSend.push({
        logId,
        to: person.work_email as string,
        subject,
        html: noticeEmailHtml({
          preheader:
            noticeParts?.preheader ??
            (opts.kind === "policy"
              ? `${opts.title} is waiting for your signature.`
              : `${opts.title} is waiting to be completed.`),
          heading:
            noticeParts?.heading ??
            (opts.kind === "policy" ? "A policy to read and sign" : "A form to complete"),
          bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(person.full_name.split(" ")[0] ?? person.full_name)},</p>
            <p style="margin:0 0 12px;">${escapeHtml(companyName)} has asked you to ${what}.${due}</p>${
              opts.notice?.from
                ? `<p style="margin:0 0 12px;">It is from ${escapeHtml(opts.notice.from)}.</p>`
                : ""
            }
            <p style="margin:0;">${
              hasLogin
                ? how
                : `${how} Look out for a separate email inviting you to set up your login, then it will be waiting for you.`
            }</p>`,
          ctaLabel: hasLogin ? "Open my briefings" : undefined,
          ctaUrl: hasLogin ? `${siteUrl()}/my` : undefined,
        }),
      });
    });
    if (toSend.length === 0) return outcome;

    const results = await sendEmailBatch(
      toSend.map((m) => ({ to: m.to, subject: m.subject, html: m.html })),
      { companyId: opts.companyId },
    );

    const sentIds: string[] = [];
    const failedIds: string[] = [];
    const skippedIds: string[] = [];
    results.forEach((r, i) => {
      const logId = toSend[i].logId;
      if (r.sent) {
        outcome.emailed += 1;
        sentIds.push(logId);
      } else if (r.skippedReason) {
        outcome.failed += 1;
        if (r.skippedReason === TEST_COMPANY_NO_MESSAGES) outcome.muted += 1;
        skippedIds.push(logId);
      } else {
        outcome.failed += 1;
        failedIds.push(logId);
      }
    });
    await Promise.all([
      settleNotifications(sentIds, "sent"),
      settleNotifications(skippedIds, "skipped", "Email is not configured"),
      settleNotifications(failedIds, "failed", "Resend rejected the message"),
    ]);
  } catch (e) {
    console.error("[notify] briefing send failed:", (e as Error).message);
  }
  return outcome;
}

/** Everything still outstanding for one company, for the daily digest. */
export async function getOutstandingBriefings(companyId: string): Promise<OutstandingBriefing[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("assignments")
    .select(
      "id, kind, due_date, person_id, people:person_id(full_name, work_email, profile_id, branch_id), forms:form_id(name), company_policies:policy_id(title), briefing_notices:notice_id(title)",
    )
    .eq("company_id", companyId)
    .eq("status", "assigned");
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
    id: string;
    kind: "form" | "policy" | "notice";
    due_date: string | null;
    person_id: string;
    people: PersonRow | PersonRow[] | null;
    forms: { name: string } | { name: string }[] | null;
    company_policies: { title: string } | { title: string }[] | null;
    briefing_notices: { title: string } | { title: string }[] | null;
  }>).map((r) => {
    const person = one(r.people);
    return {
      assignmentId: r.id,
      kind: r.kind,
      title:
        r.kind === "notice"
          ? (one(r.briefing_notices)?.title ?? "Briefing")
          : r.kind === "policy"
            ? (one(r.company_policies)?.title ?? "Policy")
            : (one(r.forms)?.name ?? "Form"),
      dueDate: r.due_date,
      personId: r.person_id,
      personName: person?.full_name ?? "Someone",
      personEmail: person?.work_email ?? null,
      personProfileId: person?.profile_id ?? null,
      branchId: person?.branch_id ?? null,
    };
  });
}

function daysLate(dueDate: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/**
 * The Team Member's own reminder: one email per person per day, listing
 * everything of theirs that is due today or already late. Briefings with no due
 * date are never chased, because there is nothing to be late for.
 */
export async function sendBriefingChases(opts: {
  companyId: string;
  companyName: string;
  outstanding: OutstandingBriefing[];
  today: string;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  const tally = { sent: 0, skipped: 0, failed: 0 };
  const due = opts.outstanding.filter(
    (b) => b.dueDate != null && b.dueDate <= opts.today && isSendableAddress(b.personEmail),
  );
  if (due.length === 0) return tally;

  const byPerson = new Map<string, OutstandingBriefing[]>();
  for (const b of due) {
    byPerson.set(b.personId, [...(byPerson.get(b.personId) ?? []), b]);
  }

  const messages: Array<{ logId: string; to: string; subject: string; html: string }> = [];
  for (const [personId, items] of byPerson) {
    const first = items[0];
    const late = items.filter((i) => i.dueDate != null && i.dueDate < opts.today).length;
    const subject =
      items.length === 1
        ? late > 0
          ? `Overdue: ${first.title}`
          : `Due today: ${first.title}`
        : `${items.length} briefings waiting for you`;
    const logId = await claimNotification({
      companyId: opts.companyId,
      branchId: first.branchId,
      recipientProfileId: first.personProfileId,
      channel: "email",
      kind: "briefing_chase",
      dedupeKey: `briefing_chase:${personId}:${opts.today}`,
      toAddress: first.personEmail as string,
      subject,
      metadata: { items: items.length, overdue: late },
    });
    if (!logId) {
      tally.skipped += 1;
      continue;
    }
    const rows = items
      .map((i) => {
        const when =
          i.dueDate == null
            ? ""
            : i.dueDate < opts.today
              ? ` <span style="color:#fca5a5;">${daysLate(i.dueDate, opts.today)} days late</span>`
              : ` <span style="color:#fcd34d;">due today</span>`;
        return `<li style="margin:0 0 6px;">${escapeHtml(i.title)}${when}</li>`;
      })
      .join("");
    messages.push({
      logId,
      to: first.personEmail as string,
      subject,
      html: noticeEmailHtml({
        preheader: `${items.length} to do at ${opts.companyName}.`,
        heading: late > 0 ? "Something is waiting for you" : "Due today",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(first.personName.split(" ")[0] ?? first.personName)},</p>
          <p style="margin:0 0 12px;">These are still waiting for you at ${escapeHtml(opts.companyName)}:</p>
          <ul style="margin:0 0 12px; padding-left:18px;">${rows}</ul>
          <p style="margin:0;">${HOW_TO_SIGN}</p>`,
        ctaLabel: first.personProfileId ? "Open my briefings" : undefined,
        ctaUrl: first.personProfileId ? `${siteUrl()}/my` : undefined,
      }),
    });
  }
  if (messages.length === 0) return tally;

  const results = await sendEmailBatch(
    messages.map((m) => ({ to: m.to, subject: m.subject, html: m.html })),
    { companyId: opts.companyId },
  );
  const sentIds: string[] = [];
  const failedIds: string[] = [];
  const skippedIds: string[] = [];
  results.forEach((r, i) => {
    if (r.sent) {
      tally.sent += 1;
      sentIds.push(messages[i].logId);
    } else if (r.skippedReason) {
      tally.skipped += 1;
      skippedIds.push(messages[i].logId);
    } else {
      tally.failed += 1;
      failedIds.push(messages[i].logId);
    }
  });
  await Promise.all([
    settleNotifications(sentIds, "sent"),
    settleNotifications(skippedIds, "skipped", "Email is not configured"),
    settleNotifications(failedIds, "failed", "Resend rejected the message"),
  ]);
  return tally;
}

/**
 * The Manager's chase list. Only OVERDUE briefings, so this is not a third daily
 * email in a well run company: if nothing is late, nothing is sent. Admins see
 * the company, Managers see their own branches.
 */
export function overdueForRecipient(
  outstanding: OutstandingBriefing[],
  recipient: { role: string; branchIds: string[] },
  today: string,
): OutstandingBriefing[] {
  const overdue = outstanding.filter((b) => b.dueDate != null && b.dueDate < today);
  /*
   * AN ALLOWLIST, not a denylist (2026-08-10, matching lib/invoicing/overdue-scope.ts).
   *
   * This used to end `return overdue`, so ANY role that was not "manager" got the whole company:
   * every person's name and every overdue briefing title. The only thing stopping a supervisor
   * seeing that was a `continue` in the cron route, which is safety living in another file. Add a
   * role to getRecipients and the leak arrives with it.
   */
  if (recipient.role === "company_admin") return overdue;
  if (recipient.role !== "manager") return [];
  if (recipient.branchIds.length === 0) return [];
  return overdue.filter((b) => b.branchId != null && recipient.branchIds.includes(b.branchId));
}

export function managerOutstandingSubject(count: number): string {
  return count === 1 ? "1 briefing is overdue" : `${count} briefings are overdue`;
}

export function managerOutstandingHtml(opts: {
  recipientName: string;
  companyName: string;
  items: OutstandingBriefing[];
  today: string;
}): string {
  const rows = opts.items
    .slice(0, 40)
    .map(
      (i) =>
        `<li style="margin:0 0 6px;">${escapeHtml(i.personName)}: ${escapeHtml(i.title)} <span style="color:#fca5a5;">${daysLate(i.dueDate as string, opts.today)} days late</span></li>`,
    )
    .join("");
  const more =
    opts.items.length > 40
      ? `<p style="margin:0 0 12px;">And ${opts.items.length - 40} more.</p>`
      : "";
  return noticeEmailHtml({
    preheader: `${opts.items.length} overdue at ${opts.companyName}.`,
    heading: "Briefings still outstanding",
    bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(opts.recipientName.split(" ")[0] ?? opts.recipientName)},</p>
      <p style="margin:0 0 12px;">These briefings are past their date at ${escapeHtml(opts.companyName)}:</p>
      <ul style="margin:0 0 12px; padding-left:18px;">${rows}</ul>${more}
      <p style="margin:0;">Each person has been reminded by email as well.</p>`,
    ctaLabel: "Open Briefings",
    ctaUrl: `${siteUrl()}/briefings`,
  });
}

/** Who "the office team" is for a copy of a memo or message (Phil, 2026-10-08). */
const OFFICE_COPY_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor"];
/** Of those, who can open Briefings, so gets a button to it. */
const BRIEFINGS_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager"];

/**
 * "Also email the office team": an FYI copy of a memo, message or attachment to the office
 * logins (Admins, RI, RM, Managers, Supervisors), who mostly have no People record and so cannot
 * be given it to read and sign. The words are IN this email, because a copy is not tracked and
 * not everyone copied can open Briefings. Never the sender, never anyone who already got it as a
 * person, never twice for the same briefing.
 */
export async function emailOfficeCopy(opts: {
  companyId: string;
  noticeId: string;
  senderProfileId: string;
  senderName: string;
  noticeKind: NoticeKind;
  title: string;
  bodyHtml: string;
  fileCount: number;
  sentTo: number;
  alreadyEmailedProfileIds: string[];
}): Promise<{ emailed: number; muted: number; failed: number }> {
  const tally = { emailed: 0, muted: 0, failed: 0 };
  try {
    const supabase = createServiceClient();
    const [{ data: office }, { data: company }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("company_id", opts.companyId)
        .eq("status", "active")
        .in("role", OFFICE_COPY_ROLES),
      supabase.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
    ]);
    const skip = new Set([opts.senderProfileId, ...opts.alreadyEmailedProfileIds]);
    const targets = ((office ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string }>)
      .filter((p) => !skip.has(p.id) && isSendableAddress(p.email));
    if (targets.length === 0) return tally;

    const companyName = (company?.name as string | null) ?? "your company";
    const label = NOTICE_KIND_LABELS[opts.noticeKind].toLowerCase();
    const subject = `Copy: ${opts.title}`;
    const claims = await Promise.all(
      targets.map((p) =>
        claimNotification({
          companyId: opts.companyId,
          recipientProfileId: p.id,
          channel: "email",
          kind: "briefing_office_copy",
          dedupeKey: `briefing_office_copy:${opts.noticeId}:${p.id}`,
          toAddress: p.email as string,
          subject,
          metadata: { notice_id: opts.noticeId },
        }),
      ),
    );
    const toSend: Array<{ logId: string; to: string; html: string }> = [];
    claims.forEach((logId, i) => {
      if (!logId) return;
      const p = targets[i];
      const canOpen = BRIEFINGS_ROLES.includes(p.role);
      const files =
        opts.fileCount > 0
          ? `<p style="margin:0 0 12px;">It has ${opts.fileCount === 1 ? "a file" : `${opts.fileCount} files`} with it, in Be Care Compliant.</p>`
          : "";
      toSend.push({
        logId,
        to: p.email as string,
        html: noticeEmailHtml({
          preheader: `${opts.senderName} sent a ${label} to the team.`,
          heading: `A copy of a ${label} sent to the team`,
          bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml((p.full_name ?? "").split(" ")[0] || "there")},</p>
            <p style="margin:0 0 12px;">${escapeHtml(opts.senderName)} sent this ${label} to ${opts.sentTo} ${opts.sentTo === 1 ? "person" : "people"} at ${escapeHtml(companyName)}. This is your copy, for information.</p>
            <p style="margin:0 0 8px; font-weight:700; color:#ffffff;">${escapeHtml(opts.title)}</p>
            ${opts.bodyHtml}${files}`,
          ctaLabel: canOpen ? "Open Briefings" : undefined,
          ctaUrl: canOpen ? `${siteUrl()}/briefings` : undefined,
        }),
      });
    });
    if (toSend.length === 0) return tally;
    const results = await sendEmailBatch(
      toSend.map((m) => ({ to: m.to, subject, html: m.html })),
      { companyId: opts.companyId },
    );
    const sent: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.sent) {
        tally.emailed += 1;
        sent.push(toSend[i].logId);
      } else if (r.skippedReason) {
        if (r.skippedReason === TEST_COMPANY_NO_MESSAGES) tally.muted += 1;
        else tally.failed += 1;
        skipped.push(toSend[i].logId);
      } else {
        tally.failed += 1;
        failed.push(toSend[i].logId);
      }
    });
    await Promise.all([
      settleNotifications(sent, "sent"),
      settleNotifications(skipped, "skipped", "Email is not configured or switched off"),
      settleNotifications(failed, "failed", "Resend rejected the message"),
    ]);
  } catch (e) {
    console.error("[notify] office copy failed:", (e as Error).message);
  }
  return tally;
}
