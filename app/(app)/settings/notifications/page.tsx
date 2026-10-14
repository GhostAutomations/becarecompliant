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
import NotificationGrid, { type GridDefinition, type GridPerson } from "@/components/settings/notification-grid";
import { NOTIFIABLE_ROLES } from "@/lib/notifications/activity";
import { ROLE_LABELS } from "@/lib/nav";

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

  /* WHO IS TOLD WHEN A CHECK IS COMPLETED (0473, Phil 2026-10-14). People across the top: every
     active or invited login whose role can open other people's checks. Each person's ticks come
     from the database's own get_notification_preferences, so the Supervisor default shows exactly
     as it is applied. Read through the Admin's own client: the database refuses anyone else. */
  const [{ data: notifiable }, { data: branchRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, status")
      .eq("company_id", profile.company_id)
      .in("status", ["active", "invited"])
      .in("role", NOTIFIABLE_ROLES as unknown as string[])
      .order("full_name"),
    supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", profile.company_id)
      .eq("kind", "branch")
      .eq("status", "active")
      .order("name"),
  ]);
  const roleOrder = ["company_admin", "registered_individual", "registered_manager", "recruiter", "manager", "supervisor"];
  const gridPeopleRows = ((notifiable ?? []) as Array<{ id: string; full_name: string | null; email: string; role: string; status: string }>)
    .slice()
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  const ids = gridPeopleRows.map((p) => p.id);
  const [{ data: ubRows }, prefResults] = await Promise.all([
    ids.length
      ? supabase.from("user_branches").select("user_id, branch_id, is_primary").in("user_id", ids)
      : Promise.resolve({ data: [] as Array<{ user_id: string; branch_id: string; is_primary: boolean }> }),
    Promise.all(ids.map((id) => supabase.rpc("get_notification_preferences", { p_profile: id }))),
  ]);
  const gridBranches = ((branchRows ?? []) as Array<{ id: string; name: string }>).map((b) => ({ id: b.id, name: b.name }));
  const activeBranchIds = new Set(gridBranches.map((b) => b.id));
  const gridPeople: GridPerson[] = gridPeopleRows.map((p) => {
    const mine = ((ubRows ?? []) as Array<{ user_id: string; branch_id: string; is_primary: boolean }>).filter(
      (u) => u.user_id === p.id && activeBranchIds.has(u.branch_id),
    );
    mine.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    return {
      id: p.id,
      name: p.full_name || p.email,
      role: p.role,
      roleLabel: ROLE_LABELS[p.role] ?? p.role,
      invited: p.status === "invited",
      primaryBranchId: mine.find((u) => u.is_primary)?.branch_id ?? null,
      branchIds: mine.map((u) => u.branch_id),
    };
  });
  let gridDefinitions: GridDefinition[] = [];
  const gridInitial: Record<string, Record<string, { inApp: boolean; email: boolean }>> = {};
  let gridError: string | null = null;
  prefResults.forEach((r, i) => {
    if (r.error) {
      gridError = r.error.message;
      return;
    }
    const rows = (r.data ?? []) as Array<{ definition_id: string; population: string; check_name: string; in_app: boolean; email: boolean }>;
    if (gridDefinitions.length === 0) {
      gridDefinitions = rows.map((x) => ({
        id: x.definition_id,
        population: x.population === "people" ? "people" : "service_users",
        name: x.check_name,
      }));
    }
    gridInitial[ids[i]] = Object.fromEntries(rows.map((x) => [x.definition_id, { inApp: x.in_app, email: x.email }]));
  });

  return (
    <div className="page-shell space-y-6">
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

      <section className="glass-card space-y-3 p-5 backdrop-blur-none" aria-label="Who is told when a check is completed">
        <div>
          <h2 className="text-sm font-semibold text-white/80">Who is told when a check is completed</h2>
          <p className="mt-1 text-xs text-white/55">
            Tick Recent activity to show it on their dashboard, and Email to email them as well. Supervisors start with Care Plan
            Review completed.
          </p>
        </div>
        {gridError ? (
          <p className="text-sm text-red-300">The notification settings could not be read: {gridError}</p>
        ) : (
          <NotificationGrid
            people={gridPeople}
            definitions={gridDefinitions}
            initial={gridInitial}
            branches={gridBranches}
            emailConfigured={resendConfigured()}
          />
        )}
      </section>
    </div>
  );
}
