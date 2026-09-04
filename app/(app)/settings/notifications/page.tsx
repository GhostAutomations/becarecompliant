import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import NotificationSettings, {
  type EscalationUser,
  type SmsReply,
} from "@/components/settings/notification-settings";
import { resendConfigured } from "@/lib/email/resend";
import { twilioConfigured } from "@/lib/sms/twilio";
import { SMS_ESCALATION_ROLES } from "@/lib/notifications/roles";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications/defaults";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  /*
   * All four reads go through the USER's client, so RLS is the authorisation. sms_inbound and
   * sms_opt_outs admit a Company Admin for their own company and the founder, and nobody else:
   * a reply can name a Service User, so it is not member wide reading.
   */
  const [{ data: settings }, { data: users }, { data: inbound }, { data: optOuts }] =
    await Promise.all([
      supabase
        .from("notification_settings")
        .select("*")
        .eq("company_id", profile.company_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, phone")
        .eq("company_id", profile.company_id)
        .eq("status", "active")
        .in("role", SMS_ESCALATION_ROLES)
        .order("full_name"),
      supabase
        .from("sms_inbound")
        .select("id, from_number, profile_id, body, keyword, received_at")
        .eq("company_id", profile.company_id)
        .order("received_at", { ascending: false })
        .limit(20),
      supabase
        .from("sms_opt_outs")
        .select("phone")
        .eq("company_id", profile.company_id),
    ]);

  const optedOutNumbers = new Set((optOuts ?? []).map((o) => o.phone as string));

  const escalationUsers: EscalationUser[] = (users ?? []).map((u) => ({
    profileId: u.id,
    fullName: u.full_name || u.email,
    email: u.email,
    role: u.role,
    phone: (u.phone as string | null) ?? null,
    optedOut: Boolean(u.phone) && optedOutNumbers.has(u.phone as string),
  }));

  // Names come from the list above rather than a second query: a reply from a number we do not
  // hold is shown as the number, which is the honest thing to put on screen.
  const nameByProfileId = new Map(escalationUsers.map((u) => [u.profileId, u.fullName]));

  // Formatted HERE, on the server, so the list cannot render one way on the server and another
  // in the browser once the client component hydrates.
  const when = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  const replies: SmsReply[] = (inbound ?? []).map((r) => ({
    id: r.id as string,
    fromNumber: r.from_number as string,
    senderName: nameByProfileId.get(r.profile_id as string) ?? null,
    body: (r.body as string) ?? "",
    keyword: (r.keyword as string | null) ?? null,
    receivedAt: when.format(new Date(r.received_at as string)),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Notifications</h1>
        <p className="page-subtitle">
          The daily compliance digest, overdue chasers and SMS escalation for your
          company.
        </p>
      </div>

      <NotificationSettings
        initial={{
          emailDigestEnabled:
            settings?.email_digest_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.emailDigestEnabled,
          smsEnabled: settings?.sms_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.smsEnabled,
          chaserFirstDays:
            settings?.chaser_first_days ?? DEFAULT_NOTIFICATION_SETTINGS.chaserFirstDays,
          chaserSecondDays:
            settings?.chaser_second_days ?? DEFAULT_NOTIFICATION_SETTINGS.chaserSecondDays,
          smsOverdueDays:
            settings?.sms_overdue_days ?? DEFAULT_NOTIFICATION_SETTINGS.smsOverdueDays,
        }}
        users={escalationUsers}
        replies={replies}
        emailConfigured={resendConfigured()}
        smsConfigured={twilioConfigured()}
      />
    </div>
  );
}
