import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { checkCompletedEmailHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { activityHref, completionEmailSubject, displayDate } from "@/lib/notifications/activity";

/**
 * THE COMPLETION EMAIL (0473, Phil 2026-10-14; docs/decisions/personal-notifications.md).
 *
 * The database has already decided who is told about this completion (notify_check_completed)
 * and whether they asked for Email (user_notifications.email_wanted). This sends exactly those,
 * each ONCE: the notification_log dedupe key "check_completed:<notification id>" is claimed before
 * sending, so a retry, a double submit or a second call sends nothing more.
 *
 * TEST COMPANIES. Phil chose by popup (2026-10-14) that these emails go out for test companies too,
 * a third exception beside login invites and password resets. So sendEmail is called WITHOUT the
 * company, which is the one thing that mutes a test company (lib/email/muted.ts), exactly as the
 * invite and reset emails do. A real company is unaffected either way.
 *
 * Never throws: a completion must never fail because an email could not go. A missing
 * RESEND_API_KEY or RESEND_FROM is recorded as skipped in the log, and Settings, Users shows it.
 */
export async function emailCompletionNotifications(evidenceId: string | null | undefined): Promise<void> {
  if (!evidenceId) return;
  try {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("user_notifications")
      .select(
        "id, company_id, branch_id, profile_id, evidence_id, person_id, service_user_id, actor_name, completed_on, definition:check_definitions(name), profile:profiles!user_notifications_profile_id_fkey(full_name, email, status), branch:branches(name)",
      )
      .eq("evidence_id", evidenceId)
      .eq("email_wanted", true);
    type Row = {
      id: string;
      company_id: string;
      branch_id: string | null;
      profile_id: string;
      evidence_id: string | null;
      person_id: string | null;
      service_user_id: string | null;
      actor_name: string | null;
      completed_on: string | null;
      definition: { name: string } | null;
      profile: { full_name: string; email: string | null; status: string } | null;
      branch: { name: string } | null;
    };
    const list = (rows ?? []) as unknown as Row[];
    if (list.length === 0) return;

    const companyId = list[0].company_id;
    const { data: company } = await service.from("companies").select("name").eq("id", companyId).maybeSingle();
    const companyName = (company as { name?: string } | null)?.name ?? "";
    let recordName: string | null = null;
    const first = list[0];
    if (first.service_user_id) {
      const { data } = await service.from("service_users").select("full_name").eq("id", first.service_user_id).maybeSingle();
      recordName = (data as { full_name?: string } | null)?.full_name ?? null;
    } else if (first.person_id) {
      const { data } = await service.from("people").select("full_name").eq("id", first.person_id).maybeSingle();
      recordName = (data as { full_name?: string } | null)?.full_name ?? null;
    }

    for (const n of list) {
      const p = n.profile;
      if (!p?.email || p.status !== "active") continue;
      const checkName = n.definition?.name ?? "Check";
      const subject = completionEmailSubject(checkName, recordName);
      const logId = await claimNotification({
        companyId: n.company_id,
        branchId: n.branch_id,
        recipientProfileId: n.profile_id,
        channel: "email",
        kind: "check_completed",
        dedupeKey: `check_completed:${n.id}`,
        toAddress: p.email,
        subject,
        metadata: { user_notification_id: n.id, evidence_id: n.evidence_id },
      });
      if (!logId) continue;
      const url = `${siteUrl()}${activityHref({
        evidenceId: n.evidence_id,
        recordKind: n.person_id ? "person" : "service_user",
        recordId: (n.person_id ?? n.service_user_id) as string,
      })}`;
      const result = await sendEmail({
        to: p.email,
        subject,
        html: checkCompletedEmailHtml({
          recipientName: p.full_name,
          checkName,
          recordName,
          actorName: n.actor_name,
          branchName: n.branch?.name ?? null,
          completedOn: displayDate(n.completed_on),
          companyName,
          url,
        }),
      });
      await settleNotification(logId, result.sent ? "sent" : result.skippedReason ? "skipped" : "failed", result.error ?? result.skippedReason);
    }
  } catch (e) {
    console.error("[notifications] completion email skipped:", (e as Error).message);
  }
}
