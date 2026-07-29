import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import RealtimeRefresh from "@/components/realtime-refresh";
import { getComplaintCounts } from "@/lib/complaints/data";
import { getUrgentFollowUps } from "@/lib/on-call/data";
import { shiftLabel } from "@/lib/on-call/format";
import { featureEnabled } from "@/lib/billing/tier";
import { getUnmatchedSubmissionCount } from "@/lib/public-forms/data";
import { PUBLIC_FORMS_ENABLED } from "@/lib/public-forms/flag";
import {
  getComplianceBuckets,
  getHolidayPendingCount,
  getAbsenceMeetingSummary,
  getComplianceScore,
  getTrainingCompletion,
  type ComplianceScore,
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

/**
 * The compliance score.
 *
 * It is Inspection Readiness wearing a better face, NOT a second number (Phil, 2026-07-29).
 * The dial is coloured by the score band because a score IS a statement about compliance, so
 * green here means compliant rather than decorating the brand. Gold stays for the action.
 *
 * The wording never predicts an inspection outcome. "Strong" is a statement about how much of
 * the evidence is in place, and every point of it is traceable through View score breakdown.
 */
/** "12 Jul", London. The delta names the day it is measured from, never "yesterday". */
function fmtShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

/** One figure in the top block. Colour carries meaning here (red overdue, amber due soon), so
 *  gold stays for actions and is not spent on decoration. */
function StatTile({
  href,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  label: string;
  value: ReactNode;
  sub: string;
  tone: "red" | "amber" | "green" | "none";
}) {
  const valueClass =
    tone === "red"
      ? "text-red-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "green"
          ? "text-emerald-300"
          : "text-white";
  return (
    <Link
      href={href}
      className="glass-card glass-card-hover flex flex-col justify-between p-4 transition"
    >
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-white/55">{sub}</p>
    </Link>
  );
}

function ScoreDial({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  const stroke =
    score == null ? "#94a3b8" : score >= 85 ? "#43d99a" : score >= 50 ? "#f5bd6a" : "#f18196";
  return (
    <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 70 70)"
      />
    </svg>
  );
}

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
  // A Team Member (staff) login has one destination: their own area.
  if (profile.role === "staff") redirect("/my");
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

  /**
   * A SUPERVISOR MUST NOT SEE THIS. Readiness is computed through RLS, so a Supervisor's
   * figure would cover only their caseload while being presented as the company's, and both
   * links would send them to /readiness, which bounces them straight back here. The training
   * read is gated with it so it is not paid for and then thrown away.
   */
  const companyWide = MANAGER_PLUS_ROLES.includes(profile.role);
  const [score, trainingPct] = companyWide
    ? await Promise.all([
        getComplianceScore(companyId, { companyWide: true }),
        getTrainingCompletion(companyId),
      ])
    : [{ enabled: false } as ComplianceScore, null];

  const complaintCounts = canSeeComplaints
    ? await getComplaintCounts(companyId)
    : { open: 0, inProgress: 0, closed: 0, overdue: 0, avgDaysToClose: null as number | null };

  // On Call urgent follow-ups (Managers and above, when the department is enabled).
  const canSeeOnCall = isManagerPlus && (await featureEnabled(companyId, "on_call"));
  const onCallUrgent = canSeeOnCall ? await getUrgentFollowUps(companyId) : [];

  const holidayPending = isManagerPlus ? await getHolidayPendingCount(companyId) : 0;
  // Public form submissions we could not match to a record, waiting to be linked.
  const unmatchedSubmissions =
    isManagerPlus && PUBLIC_FORMS_ENABLED ? await getUnmatchedSubmissionCount(companyId) : 0;
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
    <div className="mx-auto max-w-7xl space-y-6">
      <RealtimeRefresh />
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />
      <div>
        <h1 className="page-title">{heading}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      {score.enabled ? (
        <section aria-label="Compliance score" className="grid gap-4 lg:grid-cols-12">
          <div className="glass-card flex items-center gap-5 p-5 lg:col-span-4">
            <ScoreDial score={score.score} />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-white/50">Compliance score</p>
              <p className="mt-1 text-4xl font-bold text-white">
                {score.score == null ? "Not scored" : `${score.score}%`}
              </p>
              <p className="text-sm font-semibold text-white/80">{score.label}</p>
              {/* NEVER "since yesterday". Snapshots are written when somebody opens the
                  readiness report, so the last one can be days old, and the comparison is only
                  drawn at all when every requirement was captured on the same recent day. */}
              {score.score != null && score.delta != null && score.deltaFrom ? (
                <p
                  className={`mt-1 text-xs ${
                    score.delta > 0
                      ? "text-emerald-300"
                      : score.delta < 0
                        ? "text-amber-300"
                        : "text-white/45"
                  }`}
                >
                  {score.delta === 0
                    ? "No change"
                    : `${score.delta > 0 ? "Up" : "Down"} ${Math.abs(score.delta)}`}{" "}
                  since {fmtShortDate(score.deltaFrom)}
                </p>
              ) : null}
              <Link
                href="/readiness"
                className="mt-3 inline-block text-xs font-semibold text-gold-300 underline underline-offset-4 hover:text-gold-400"
              >
                View score breakdown
              </Link>
            </div>
          </div>

          {/* The four figures that answer "what needs doing", in the same block as the score
              rather than as three separate stacked strips further down the page. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8 xl:grid-cols-4">
            <StatTile
              href="/people"
              label="People overdue"
              value={people.overdue}
              tone={people.overdue > 0 ? "red" : "green"}
              sub="staff with a check past its date"
            />
            <StatTile
              href="/service-users"
              label="Service users overdue"
              value={serviceUsers.overdue}
              tone={serviceUsers.overdue > 0 ? "red" : "green"}
              sub="people you support with a check past its date"
            />
            <StatTile
              href="/people"
              label="Due in 14 days"
              value={people.due14 + serviceUsers.due14}
              tone={people.due14 + serviceUsers.due14 > 0 ? "amber" : "green"}
              sub="across both registers"
            />
            <StatTile
              href="/people/training"
              label="Mandatory training"
              value={trainingPct == null ? "n/a" : `${Math.round(trainingPct)}%`}
              tone="none"
              sub="of mandatory training is in date"
            />
          </div>
        </section>
      ) : null}

      {score.enabled ? (
        <section aria-label="Inspection readiness">
          <div className="glass-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Inspection readiness
              </h2>
              <Link
                href="/readiness"
                className="text-xs text-gold-300 underline underline-offset-4 hover:text-gold-400"
              >
                View full report
              </Link>
            </div>
            <ul className="mt-4 space-y-2.5">
              {score.requirements.slice(0, 6).map((req) => (
                <li key={req.code} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-sm text-white/80">{req.title}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className={`block h-full rounded-full ${
                        req.status === "red"
                          ? "bg-red-400"
                          : req.status === "amber"
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                      style={{ width: `${req.score ?? 0}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums text-white/70">
                    {req.score == null ? "n/a" : `${req.score}%`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* When there is no score (readiness off, or a role that must not see it) the two
          registers keep their own strips, so the dashboard is never empty for them. */}
      {score.enabled ? null : (
        <>
          {complianceStrip("People", "/people", people, "People")}
          {complianceStrip("Service Users", "/service-users", serviceUsers, "Service users")}
        </>
      )}

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

      {canSeeOnCall && onCallUrgent.length > 0 ? (
        <section aria-label="On Call urgent follow-ups" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">On Call: urgent follow-ups</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {onCallUrgent.map((u) => (
              <Link
                key={u.id}
                href={`/on-call/log/${u.id}`}
                className="glass-card block border-l-2 border-amber-400/70 p-4 transition hover:bg-white/[0.07]"
              >
                <span className="pill-amber"><span className="pill-dot" /> Urgent</span>
                <p className="mt-2 text-base font-semibold text-white">{shiftLabel(u.shift_date, u.slot)}</p>
                {u.branch_name ? <p className="text-xs text-white/55">{u.branch_name}</p> : null}
              </Link>
            ))}
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
            {PUBLIC_FORMS_ENABLED && (
              <MetricCard
                href="/people/submissions"
                pill={
                  <span className={unmatchedSubmissions > 0 ? "pill-amber" : "pill-neutral"}>
                    {unmatchedSubmissions > 0 ? <span className="pill-dot" /> : null} Submissions to
                    link
                  </span>
                }
                value={unmatchedSubmissions}
                sub="Public form submissions we could not match to a record"
              />
            )}
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
