import { NextRequest, NextResponse } from "next/server";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import {
  digestEmailHtml,
  digestSubject,
  chaserEmailHtml,
  chaserSubject,
  reportingEmailHtml,
  reportingSubject,
  type DigestEmailItem,
  type ReportingRow,
} from "@/lib/email/templates";
import {
  getDigestCompanies,
  getRecipients,
  getAttentionItems,
  getReportingData,
  type AttentionItem,
  type Recipient,
  type ReportingCheck,
} from "@/lib/notifications/data";
import {
  buildDigests,
  scopeItems,
  chaserLevel,
  smsEscalationItems,
  splitReporting,
  scopeReporting,
  reportingDedupeKey,
  digestDedupeKey,
  chaserDedupeKey,
  smsDedupeKey,
  londonDateIso,
  isLondonSendHour,
} from "@/lib/notifications/digest";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { sendSms, twilioConfigured } from "@/lib/sms/twilio";
import { tierHasFeature } from "@/lib/billing/tier";
import type { Tier } from "@/lib/stripe/config";
import { siteUrl } from "@/lib/site";

/**
 * Daily compliance digest + escalating overdue chasers + SMS escalation.
 *
 * Scheduled twice in vercel.json (06:00 and 07:00 UTC) because Vercel Cron is
 * UTC only; the isLondonSendHour gate means exactly one of the two runs sends,
 * so the digest lands at 07:00 Europe/London in summer and winter. Every send
 * claims a dedupe key in notification_log first, so retries and the double
 * schedule can never double-send.
 *
 * Fails CLOSED: no CRON_SECRET in production means 503, wrong secret means 401.
 * This path is in middleware PUBLIC_PATHS (no user session), the secret is the
 * auth. Vercel sends it as "Authorization: Bearer <CRON_SECRET>" automatically.
 */
export const dynamic = "force-dynamic";

const asEmailItem = (i: AttentionItem): DigestEmailItem => ({
  recordName: i.recordName,
  checkName: i.checkName,
  branchName: i.branchName,
  population: i.population,
  dueDate: i.dueDate,
  rag: i.rag,
});

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Gate: sends from 07:00 London onwards (dedupe keys prevent repeats), so
  // the winter 06:00-London run is refused, Vercel's manual Run button works
  // any time of day, and a missed morning self-heals on the next invocation.
  // ?force=1 (still secret-gated) bypasses even the before-07:00 refusal.
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !isLondonSendHour()) {
    return NextResponse.json({ skipped: "Before 07:00 in London" });
  }

  const today = londonDateIso();
  const appUrl = siteUrl();
  const summary = {
    companies: 0,
    digestsSent: 0,
    reportsSent: 0,
    chasersSent: 0,
    smsSent: 0,
    skipped: 0,
    failures: [] as string[],
    emailConfigured: resendConfigured(),
    smsConfigured: twilioConfigured(),
  };

  let companies;
  try {
    companies = await getDigestCompanies();
  } catch (e) {
    return NextResponse.json(
      { error: `Could not load companies: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  for (const company of companies) {
    summary.companies += 1;
    try {
      const [recipients, items, reporting] = await Promise.all([
        getRecipients(company.id),
        getAttentionItems(company.id),
        getReportingData(company.id),
      ]);
      if (recipients.length === 0) continue;

      if (company.settings.emailDigestEnabled) {
        // 1a. Caseload digest: SUPERVISORS only. Company Admins get the two whole
        // company reports below; Managers get nothing here (Phil, 2026-07-14: the
        // company gets exactly two reporting emails a day, to the Admin). Anyone
        // with nothing to report gets no digest.
        const digestRecipients = recipients.filter((r) => r.role === "supervisor");
        for (const digest of buildDigests(digestRecipients, items)) {
          const logId = await claimNotification({
            companyId: company.id,
            recipientProfileId: digest.recipient.profileId,
            channel: "email",
            kind: "daily_digest",
            dedupeKey: digestDedupeKey(digest.recipient.profileId, today),
            toAddress: digest.recipient.email,
            subject: digestSubject(digest.overdueCount, digest.dueSoonCount),
            metadata: { overdue: digest.overdueCount, due_soon: digest.dueSoonCount },
          });
          if (!logId) {
            summary.skipped += 1;
            continue;
          }
          const result = await sendEmail({
            to: digest.recipient.email,
            subject: digestSubject(digest.overdueCount, digest.dueSoonCount),
            html: digestEmailHtml({
              recipientName: digest.recipient.fullName,
              companyName: company.name,
              dateIso: today,
              items: digest.items.map(asEmailItem),
              actionUrl: appUrl,
            }),
          });
          if (result.sent) summary.digestsSent += 1;
          else if (result.skippedReason) summary.skipped += 1;
          else summary.failures.push(`digest ${digest.recipient.email}: ${result.error}`);
          await settleNotification(
            logId,
            result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
            result.error ?? result.skippedReason,
          );
        }

        // 1b. Daily People + Service User compliance reports: exactly TWO whole
        // company emails a day, to COMPANY ADMINS (company-wide, all branches).
        // Sent every morning, including a positive all clear, but only for a
        // population the company actually has (a people only company gets no
        // Service User report). Compliance checks only, never holiday or absence.
        const toRow = (c: ReportingCheck): ReportingRow => ({
          recordId: c.recordId,
          recordName: c.recordName,
          branchName: c.branchName,
          checkName: c.checkName,
          dueDate: c.dueDate,
        });
        const reportRecipients = recipients.filter((r) => r.role === "company_admin");
        const populations: Array<{
          key: "people" | "service_users";
          checks: ReportingCheck[];
          has: boolean;
          kind: string;
        }> = [
          { key: "people", checks: reporting.people, has: reporting.hasPeople, kind: "people_report" },
          {
            key: "service_users",
            checks: reporting.serviceUsers,
            has: reporting.hasServiceUsers,
            kind: "service_user_report",
          },
        ];
        for (const recipient of reportRecipients) {
          for (const pop of populations) {
            if (!pop.has) continue;
            const scoped = scopeReporting(recipient, pop.checks);
            const { overdue, dueSoon } = splitReporting(scoped);
            const overdueRecords = new Set(overdue.map((c) => c.recordId)).size;
            const dueSoonRecords = new Set(dueSoon.map((c) => c.recordId)).size;
            const subject = reportingSubject(pop.key, overdueRecords, dueSoonRecords);
            const logId = await claimNotification({
              companyId: company.id,
              recipientProfileId: recipient.profileId,
              channel: "email",
              kind: pop.kind,
              dedupeKey: reportingDedupeKey(recipient.profileId, pop.key, today),
              toAddress: recipient.email,
              subject,
              metadata: { overdue_records: overdueRecords, due_soon_records: dueSoonRecords },
            });
            if (!logId) {
              summary.skipped += 1;
              continue;
            }
            const result = await sendEmail({
              to: recipient.email,
              subject,
              html: reportingEmailHtml({
                recipientName: recipient.fullName,
                companyName: company.name,
                dateIso: today,
                population: pop.key,
                overdue: overdue.map(toRow),
                dueSoon: dueSoon.map(toRow),
                actionUrl: appUrl,
              }),
            });
            if (result.sent) summary.reportsSent += 1;
            else if (result.skippedReason) summary.skipped += 1;
            else summary.failures.push(`report ${recipient.email}: ${result.error}`);
            await settleNotification(
              logId,
              result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
              result.error ?? result.skippedReason,
            );
          }
        }
      }

      // 2. Chasers (Managers + Admins only) and 3. SMS escalation.
      const escalationRecipients = recipients.filter(
        (r): r is Recipient => r.role === "company_admin" || r.role === "manager",
      );
      for (const recipient of escalationRecipients) {
        const scoped = scopeItems(recipient, items);

        // Chaser emails: claim per item per level, one email per level.
        const byLevel = new Map<string, { thresholdDays: number; claims: { logId: string; item: AttentionItem }[] }>();
        for (const item of scoped) {
          const level = chaserLevel(item, company.settings);
          if (!level) continue;
          const logId = await claimNotification({
            companyId: company.id,
            branchId: item.branchId,
            recipientProfileId: recipient.profileId,
            channel: "email",
            kind: level.kind,
            dedupeKey: chaserDedupeKey(level.kind, item.instanceId, item.dueDate, recipient.profileId),
            toAddress: recipient.email,
            metadata: { check: item.checkName, record: item.recordName },
          });
          if (!logId) continue;
          const bucket = byLevel.get(level.kind) ?? { thresholdDays: level.thresholdDays, claims: [] };
          bucket.claims.push({ logId, item });
          byLevel.set(level.kind, bucket);
        }
        for (const [, bucket] of byLevel) {
          const chaserItems = bucket.claims.map((c) => c.item);
          const result = await sendEmail({
            to: recipient.email,
            subject: chaserSubject(chaserItems.length, bucket.thresholdDays),
            html: chaserEmailHtml({
              recipientName: recipient.fullName,
              companyName: company.name,
              thresholdDays: bucket.thresholdDays,
              items: chaserItems.map(asEmailItem),
              actionUrl: appUrl,
            }),
          });
          if (result.sent) summary.chasersSent += 1;
          else if (result.skippedReason) summary.skipped += 1;
          else summary.failures.push(`chaser ${recipient.email}: ${result.error}`);
          for (const claim of bucket.claims) {
            await settleNotification(
              claim.logId,
              result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
              result.error ?? result.skippedReason,
            );
          }
        }

        // SMS escalation: opted-in companies, recipients with a phone number.
        // SMS reminders are a Pro-and-above feature (tier gating, server-side).
        if (!tierHasFeature(company.tier as Tier, "sms_reminders")) continue;
        if (!company.settings.smsEnabled || !recipient.phone) continue;
        const smsItems = smsEscalationItems(scoped, company.settings);
        const smsClaims: string[] = [];
        for (const item of smsItems) {
          const logId = await claimNotification({
            companyId: company.id,
            branchId: item.branchId,
            recipientProfileId: recipient.profileId,
            channel: "sms",
            kind: "sms_overdue",
            dedupeKey: smsDedupeKey(item.instanceId, item.dueDate, recipient.phone),
            toAddress: recipient.phone,
            metadata: { check: item.checkName, record: item.recordName },
          });
          if (logId) smsClaims.push(logId);
        }
        if (smsClaims.length > 0) {
          const noun = smsClaims.length === 1 ? "check is" : "checks are";
          const result = await sendSms({
            to: recipient.phone,
            companyId: company.id,
            body: `Be Care Compliant: ${smsClaims.length} compliance ${noun} ${company.settings.smsOverdueDays} or more days overdue at ${company.name}. Please sign in to review.`,
            metadata: { kind: "sms_overdue", recipient: recipient.profileId },
          });
          if (result.sent) summary.smsSent += 1;
          else if (result.skippedReason) summary.skipped += 1;
          else summary.failures.push(`sms ${recipient.phone}: ${result.error}`);
          for (const logId of smsClaims) {
            await settleNotification(
              logId,
              result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
              result.error ?? result.skippedReason,
            );
          }
        }
      }
    } catch (e) {
      summary.failures.push(`company ${company.name}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json(summary);
}
