import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import NotificationSettings, {
  type EscalationUser,
} from "@/components/settings/notification-settings";
import { resendConfigured } from "@/lib/email/resend";
import { twilioConfigured } from "@/lib/sms/twilio";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const [{ data: settings }, { data: users }] = await Promise.all([
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
      .in("role", ["company_admin", "manager"])
      .order("full_name"),
  ]);

  const escalationUsers: EscalationUser[] = (users ?? []).map((u) => ({
    profileId: u.id,
    fullName: u.full_name || u.email,
    email: u.email,
    role: u.role,
    phone: (u.phone as string | null) ?? null,
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
          emailDigestEnabled: settings?.email_digest_enabled ?? true,
          smsEnabled: settings?.sms_enabled ?? false,
          chaserFirstDays: settings?.chaser_first_days ?? 7,
          chaserSecondDays: settings?.chaser_second_days ?? 14,
          smsOverdueDays: settings?.sms_overdue_days ?? 14,
        }}
        users={escalationUsers}
        emailConfigured={resendConfigured()}
        smsConfigured={twilioConfigured()}
      />
    </div>
  );
}
