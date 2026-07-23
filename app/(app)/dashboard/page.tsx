import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import RealtimeRefresh from "@/components/realtime-refresh";
import { getComplaintCounts } from "@/lib/complaints/data";
import { featureEnabled } from "@/lib/billing/tier";
import {
  getComplianceBuckets,
  getHolidayPendingCount,
  getAbsenceMeetingSummary,
  type DueBuckets,
  type AbsenceMeetingLine,
  type AbsenceMeetingSoon,
} from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Dashboard" };

// Complaints, Holidays and Absence dashboard surfaces are "Managers and above":
// Company Admin, both Registered roles and Branch Manager (plus Founder via
// manage-as). Supervisors and Viewers do not see them.
const MANAGER_PLUS_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

/** A single clickable metric card. */
function MetricCard({
  href,
  pill,
  value,
  sub,
}: {
  href: string;
  pill: ReactNode;
  value: ReactNode;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="glass-card block p-4 transition hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
    >
      <div className="flex items-start justify-between gap-3">
        <span>{pill}</span>
        <span className="text-2xl font-bold leading-none text-white">{value}</span>
      </div>
      <p className="mt-2 text-xs text-white/50">{sub}</p>
    </Link>
  );
}

/** A card listing up to 5 people (name + stage) with a "+N more" overflow. */
function MeetingListCard({
  href,
  title,
  lines,
  emptyText,
}: {
  href: string;
  title: string;
  lines: Array<{ name: string; stage: string; when?: string }>;
  emptyText: string;
}) {
  const shown = lines.slice(0, 5);
  const extra = lines.length - shown.length;
  return (
    <Link
      href={href}
      className="glass-card block p-5 transition hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/80">{title}</span>
        <span className="text-2xl font-bold text-white">{lines.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-xs text-white/50">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {shown.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-white/85">{l.name}</span>
              <span className="shrink-0 text-xs text-white/55">
                {l.when ? `${l.stage} · ${l.when}` : l.stage}
              </span>
            </li>
          ))}
          {extra > 0 ? (
            <li className="pt-1 text-xs text-white/45">+{extra} more</li>
          ) : null}
        </ul>
      )}
    </Link>
  );
}

function formatMeetingDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

export default async function DashboardPage() {
  // requireCompany so that a founder managing as a company sees that company's
  // dashboard (shadow profile). A real founder with no company has no compliance
  // dashboard of their own: send them to the Founder console, their home.
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  // A Viewer (read-only) has no dashboard; their home is the People register.
  if (profile.role === "team_member") redirect("/people");
  // The On Call role has no dashboard; their home is the On Call rota.
  if (profile.role === "on_call") redirect("/on-call");
  const supabase = await createClient();
  const companyId = profile.company_id;

  // Greeting: a founder managing-as sees a support-session label with the company
  // name, not their own email; a normal company user is greeted by first name.
  let heading = `Welcome, ${(profile.full_name || profile.email).split(" ")[0]}`;
  let subtitle =
    "Your compliance overview. One glance: are we inspection ready across your team and the people you care for?";
  if (profile.actingAsCompanyId) {
    const { data: co } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.actingAsCompanyId)
      .maybeSingle();
    heading = `Support session: ${co?.name ?? "this company"}`;
    subtitle =
      "You are managing this company for support. Its compliance overview is below.";
  }

  // Complaints is a Pro feature and Managers-and-above only.
  const canSeeComplaints =
    MANAGER_PLUS_ROLES.includes(profile.role) && (await featureEnabled(companyId, "complaints"));
  const isManagerPlus = MANAGER_PLUS_ROLES.includes(profile.role);

  // Everyone with a dashboard sees the People + Service User due buckets.
  const { people, serviceUsers } = await getComplianceBuckets(companyId);

  const complaintCounts = canSeeComplaints
    ? await getComplaintCounts(companyId)
    : { open: 0, inProgress: 0, closed: 0, overdue: 0, avgDaysToClose: null as number | null };

  const holidayPending = isManagerPlus ? await getHolidayPendingCount(companyId) : 0;
  const absence = isManagerPlus
    ? await getAbsenceMeetingSummary(companyId)
    : { toBook: [] as AbsenceMeetingLine[], next7: [] as AbsenceMeetingSoon[] };

  const complianceStrip = (label: string, href: string, b: DueBuckets, noun: string) => (
    <section aria-label={`${label} compliance status`} className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{label}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          href={href}
          pill={<span className="pill-red"><span className="pill-dot" /> Overdue</span>}
          value={b.overdue}
          sub={`${noun} with an overdue check`}
        />
        <MetricCard
          href={href}
          pill={<span className="pill-amber"><span className="pill-dot" /> Due in 14 days</span>}
          value={b.due14}
          sub={`${noun} with a check due within 14 days`}
        />
        <MetricCard
          href={href}
          pill={<span className="pill-neutral">Due in 30 days</span>}
          value={b.due30}
          sub={`${noun} with a check due within 30 days`}
        />
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeRefresh />
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />
      <div>
        <h1 className="page-title">{heading}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      {complianceStrip("People", "/people", people, "People")}
      {complianceStrip("Service Users", "/service-users", serviceUsers, "Service users")}

      {canSeeComplaints ? (
        <section aria-label="Complaints status" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Complaints</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              href="/complaints"
              pill={<span className="pill-neutral">Open</span>}
              value={complaintCounts.open + complaintCounts.inProgress}
              sub="Complaints still being handled"
            />
            <MetricCard
              href="/complaints"
              pill={<span className="pill-red"><span className="pill-dot" /> Overdue</span>}
              value={complaintCounts.overdue}
              sub="Past their response deadline"
            />
            <MetricCard
              href="/complaints"
              pill={<span className="pill-neutral">Avg days to close</span>}
              value={complaintCounts.avgDaysToClose ?? "—"}
              sub="Average days from raised to closed"
            />
          </div>
        </section>
      ) : null}

      {isManagerPlus ? (
        <section aria-label="Holidays" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Holidays</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              href="/people/holiday"
              pill={<span className="pill-amber"><span className="pill-dot" /> Pending requests</span>}
              value={holidayPending}
              sub="Holiday requests awaiting a decision"
            />
          </div>
        </section>
      ) : null}

      {isManagerPlus ? (
        <section aria-label="Absence" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Absence</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <MeetingListCard
              href="/people/absence"
              title="Meetings to book"
              lines={absence.toBook}
              emptyText="No absence meetings need booking."
            />
            <MeetingListCard
              href="/people/absence"
              title="Meetings in the next 7 days"
              lines={absence.next7.map((m) => ({
                name: m.name,
                stage: m.stage,
                when: formatMeetingDate(m.date),
              }))}
              emptyText="No meetings scheduled in the next 7 days."
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
