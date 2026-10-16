import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { concernRaisedEmailHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { claimNotification, settleNotification } from "@/lib/notifications/log";

/**
 * The email half of "Concern raised in a care note" (Rota and Visits Stage 5, Phil 2026-10-16;
 * docs/decisions/rota-visits.md, Stage 5 decision 12). The database has already decided who is told
 * and whether they asked for Email (rota_notify_concern, user_notifications.email_wanted). This
 * sends exactly those, each once: the notification_log key "concern_raised:<notification id>" is
 * claimed before sending, so a second call sends nothing more.
 *
 * Called by the carer's phone after a concern is accepted, for the carer's own company only, and it
 * also picks up anything from the last day that did not go, so one failed call is not the end of it.
 *
 * TEST COMPANIES send nothing: sendEmail is given the company, which mutes a test company (the
 * standing rule; unlike completion emails, no exception was agreed for concerns).
 *
 * Never throws. A missing RESEND_API_KEY or RESEND_FROM is logged as skipped, which Settings,
 * Notifications shows.
 */
export async function emailConcernNotifications(companyId: string): Promise<number> {
  let sent = 0;
  try {
    const service = createServiceClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows } = await service
      .from("user_notifications")
      .select(
        "id, company_id, branch_id, profile_id, concern_id, service_user_id, actor_name, created_at, profile:profiles!user_notifications_profile_id_fkey(full_name, email, status), branch:branches(name)",
      )
      .eq("company_id", companyId)
      .eq("event_type", "concern_raised")
      .eq("email_wanted", true)
      .gte("created_at", since)
      .limit(200);
    type Row = {
      id: string;
      company_id: string;
      branch_id: string | null;
      profile_id: string;
      concern_id: string | null;
      service_user_id: string | null;
      actor_name: string | null;
      created_at: string;
      profile: { full_name: string; email: string | null; status: string } | null;
      branch: { name: string } | null;
    };
    const list = (rows ?? []) as unknown as Row[];
    if (list.length === 0) return 0;

    const { data: company } = await service.from("companies").select("name").eq("id", companyId).maybeSingle();
    const companyName = (company as { name?: string } | null)?.name ?? "";
    const suIds = [...new Set(list.map((r) => r.service_user_id).filter((x): x is string => !!x))];
    const { data: sus } = suIds.length
      ? await service.from("service_users").select("id, full_name").in("id", suIds).eq("company_id", companyId)
      : { data: [] };
    const suName = new Map(((sus ?? []) as Array<{ id: string; full_name: string }>).map((s) => [s.id, s.full_name]));

    for (const n of list) {
      const p = n.profile;
      if (!p?.email || p.status !== "active" || !n.concern_id) continue;
      const subject = `Concern raised${n.service_user_id && suName.get(n.service_user_id) ? ` for ${suName.get(n.service_user_id)}` : ""}`;
      const logId = await claimNotification({
        companyId: n.company_id,
        branchId: n.branch_id,
        recipientProfileId: n.profile_id,
        channel: "email",
        kind: "concern_raised",
        dedupeKey: `concern_raised:${n.id}`,
        toAddress: p.email,
        subject,
        metadata: { user_notification_id: n.id, concern_id: n.concern_id },
      });
      if (!logId) continue;
      const result = await sendEmail({
        to: p.email,
        subject,
        companyId: n.company_id,
        html: concernRaisedEmailHtml({
          recipientName: p.full_name,
          serviceUserName: n.service_user_id ? suName.get(n.service_user_id) ?? null : null,
          carerName: n.actor_name,
          raisedAt: new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }),
          branchName: n.branch?.name ?? null,
          companyName,
          url: `${siteUrl()}/rota/concerns?concern=${n.concern_id}`,
        }),
      });
      if (result.sent) sent++;
      await settleNotification(logId, result.sent ? "sent" : result.skippedReason ? "skipped" : "failed", result.error ?? result.skippedReason);
    }
  } catch (e) {
    console.error("[rota] concern email skipped:", (e as Error).message);
  }
  return sent;
}
