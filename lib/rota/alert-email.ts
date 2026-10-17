import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { visitAlertEmailHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { claimNotification, settleNotification } from "@/lib/notifications/log";

/**
 * The email half of the visit alerts (Rota and Visits Stage 7, decision 4). The database decided who
 * is told and whether they asked for Email (rota_notify_alert, user_notifications.email_wanted).
 * This sends exactly those, each once (notification_log key "<event>:<notification id>"), for the
 * last day. Test companies send nothing (sendEmail mutes them). Never throws.
 */
const EVENTS = { visit_late: "Visit late", visit_missed: "Visit missed", dose_not_recorded: "Dose not recorded" } as const;

export async function emailVisitAlerts(): Promise<number> {
  let sent = 0;
  try {
    const service = createServiceClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows } = await service
      .from("user_notifications")
      .select(
        "id, event_type, company_id, branch_id, profile_id, visit_id, service_user_id, actor_name, profile:profiles!user_notifications_profile_id_fkey(full_name, email, status), branch:branches(name)",
      )
      .in("event_type", Object.keys(EVENTS))
      .eq("email_wanted", true)
      .gte("created_at", since)
      .limit(300);
    type Row = {
      id: string; event_type: keyof typeof EVENTS; company_id: string; branch_id: string | null; profile_id: string; visit_id: string | null;
      service_user_id: string | null; actor_name: string | null;
      profile: { full_name: string; email: string | null; status: string } | null; branch: { name: string } | null;
    };
    const list = (rows ?? []) as unknown as Row[];
    if (list.length === 0) return 0;
    const companyIds = [...new Set(list.map((r) => r.company_id))];
    const visitIds = [...new Set(list.map((r) => r.visit_id).filter((x): x is string => !!x))];
    const suIds = [...new Set(list.map((r) => r.service_user_id).filter((x): x is string => !!x))];
    const [{ data: companies }, { data: visits }, { data: sus }, { data: alerts }] = await Promise.all([
      service.from("companies").select("id, name").in("id", companyIds),
      visitIds.length ? service.from("rota_visits").select("id, company_id, start_time").in("id", visitIds) : Promise.resolve({ data: [] }),
      suIds.length ? service.from("service_users").select("id, company_id, full_name").in("id", suIds) : Promise.resolve({ data: [] }),
      visitIds.length ? service.from("rota_visit_alerts").select("visit_id, kind, urgent").in("visit_id", visitIds) : Promise.resolve({ data: [] }),
    ]);
    const companyName = new Map(((companies ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const visit = new Map(((visits ?? []) as { id: string; company_id: string; start_time: string }[]).map((v) => [v.id, v]));
    const su = new Map(((sus ?? []) as { id: string; company_id: string; full_name: string }[]).map((s) => [s.id, s]));
    const urgentOf = new Map(((alerts ?? []) as { visit_id: string; kind: string; urgent: boolean }[]).map((a) => [`${a.visit_id}:${a.kind}`, a.urgent]));
    const kindOf = { visit_late: "late", visit_missed: "missed", dose_not_recorded: "dose_not_recorded" } as const;

    for (const n of list) {
      const p = n.profile;
      if (!p?.email || p.status !== "active") continue;
      const v = n.visit_id ? visit.get(n.visit_id) : undefined;
      const s = n.service_user_id ? su.get(n.service_user_id) : undefined;
      // Every name and time read here must belong to the notice's own company.
      const who = s && s.company_id === n.company_id ? s.full_name : null;
      const time = v && v.company_id === n.company_id ? v.start_time.slice(0, 5) : null;
      const heading = EVENTS[n.event_type];
      const subject = `${heading}${who ? ` for ${who}` : ""}`;
      const logId = await claimNotification({
        companyId: n.company_id,
        branchId: n.branch_id,
        recipientProfileId: n.profile_id,
        channel: "email",
        kind: n.event_type,
        dedupeKey: `${n.event_type}:${n.id}`,
        toAddress: p.email,
        subject,
        metadata: { user_notification_id: n.id, visit_id: n.visit_id },
      });
      if (!logId) continue;
      const result = await sendEmail({
        to: p.email,
        subject,
        companyId: n.company_id,
        html: visitAlertEmailHtml({
          recipientName: p.full_name,
          heading,
          serviceUserName: who,
          visitTime: time,
          carerNames: n.actor_name,
          urgent: Boolean(n.visit_id && urgentOf.get(`${n.visit_id}:${kindOf[n.event_type]}`)),
          branchName: n.branch?.name ?? null,
          companyName: companyName.get(n.company_id) ?? "",
          url: `${siteUrl()}/rota/alerts${n.branch_id ? `?branch=${n.branch_id}` : ""}`,
        }),
      });
      if (result.sent) sent++;
      await settleNotification(logId, result.sent ? "sent" : result.skippedReason ? "skipped" : "failed", result.error ?? result.skippedReason);
    }
  } catch (e) {
    console.error("[rota] visit alert email skipped:", (e as Error).message);
  }
  return sent;
}
