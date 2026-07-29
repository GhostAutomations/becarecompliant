import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import RealtimeRefresh from "@/components/realtime-refresh";
import { getUrgentFollowUps } from "@/lib/on-call/data";
import { shiftLabel } from "@/lib/on-call/format";
import { featureEnabled } from "@/lib/billing/tier";
import {
  getComplianceBuckets,
  getComplianceScore,
  getTrainingCompletion,
  getAuditsCompleted,
  getExpiringSoon,
  getComplianceCalendar,
  getRecentActivity,
  type ComplianceScore,
} from "@/lib/dashboard/data";

/**
 * The dashboard, rebuilt to Phil's Mission Control design (2026-07-29).
 *
 * THE RULE HE SET: every tile in the design gets built. The ones that have real data behind
 * them are plumbed in. The ones that do not are drawn in RED, so the gap is visible on the
 * screen instead of quietly missing from it. A red tile is a to do list item you can see.
 *
 * RED TODAY, and what each one needs:
 *   Upcoming inspections  nothing in the product records a scheduled inspection
 *   Incidents             there is no incidents feature; Complaints is adjacent, not the same
 *   Risk level            no risk model exists, and a number here would be invented
 *   Policies up to date   needs signing coverage per policy, not just a count of policies
 *   AI insights           the AI layer exists but is not wired to run for the dashboard
 *   Date range            the tiles are all live figures; nothing is filtered by period yet
 *
 * The old Complaints, Holidays and Absence strips were REMOVED on instruction, since they are
 * not in the design. Every one of them still has its own department in the navigation.
 */

export const metadata: Metadata = { title: "Dashboard" };

const MANAGER_PLUS_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

/* ------------------------------------------------------------------ tiles */

/** A tile with real data behind it. Colour carries meaning: red overdue, amber due soon. */
function Tile({
  href,
  label,
  value,
  sub,
  tone = "none",
}: {
  href?: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "red" | "amber" | "green" | "none";
}) {
  const valueClass =
    tone === "red"
      ? "text-red-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "green"
          ? "text-emerald-300"
          : "text-white";
  const inner = (
    <>
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-white/55">{sub}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="glass-card glass-card-hover flex flex-col justify-between p-4">
      {inner}
    </Link>
  ) : (
    <div className="glass-card flex flex-col justify-between p-4">{inner}</div>
  );
}

/**
 * A tile in the design that has NOTHING behind it yet.
 *
 * Deliberately loud. A greyed out placeholder gets ignored and then quietly ships; a red one
 * is a question every time the screen is opened. It says what is missing rather than showing
 * a zero, because a zero would be a wrong number rather than an absent one.
 */
function MissingTile({ label, needs }: { label: string; needs: string }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-red-400/40 bg-red-500/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-red-200/80">{label}</p>
        <span className="shrink-0 rounded-full border border-red-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
          No data
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold text-red-300/60">&mdash;</p>
      <p className="mt-1 text-xs text-red-200/70">{needs}</p>
    </div>
  );
}

function Panel({
  title,
  href,
  linkLabel = "View all",
  children,
  className = "",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card p-5 ${className}`} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="shrink-0 text-xs text-gold-300 underline underline-offset-4 hover:text-gold-400"
          >
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MissingPanel({ title, needs }: { title: string; needs: string }) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-red-400/40 bg-red-500/10 p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-200/80">{title}</h2>
        <span className="shrink-0 rounded-full border border-red-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
          No data
        </span>
      </div>
      <p className="mt-4 text-sm text-red-200/70">{needs}</p>
    </section>
  );
}

function ScoreDial({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  const stroke =
    score == null ? "#94a3b8" : score >= 85 ? "#43d99a" : score >= 50 ? "#f5bd6a" : "#f18196";
  return (
    <svg viewBox="0 0 140 140" className="h-28 w-28 shrink-0" aria-hidden>
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

/** "12 Jul", London. The score movement names the day it is measured from, never "yesterday". */
function fmtShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

function fmtDay(iso: string): { day: string; date: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  return {
    day:
      iso === today
        ? "Today"
        : d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" }),
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Europe/London" }),
  };
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

/* ------------------------------------------------------------------ page */

export default async function DashboardPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (profile.role === "team_member") redirect("/people");
  if (profile.role === "on_call") redirect("/on-call");
  if (profile.role === "staff") redirect("/my");

  const supabase = await createClient();
  const companyId = profile.company_id;

  let heading = `Welcome, ${(profile.full_name || profile.email).split(" ")[0]}`;
  let subtitle = "Here is what is happening with your compliance today.";
  if (profile.actingAsCompanyId) {
    const { data: co } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.actingAsCompanyId)
      .maybeSingle();
    heading = `Support session: ${co?.name ?? "this company"}`;
    subtitle = "You are managing this company for support. Its compliance overview is below.";
  }

  const companyWide = MANAGER_PLUS_ROLES.includes(profile.role);
  const canSeeOnCall = companyWide && (await featureEnabled(companyId, "on_call"));

  const { people, serviceUsers } = await getComplianceBuckets(companyId);
  const [score, trainingPct, auditsPct, expiring, calendar, activity, onCallUrgent] =
    await Promise.all([
      companyWide
        ? getComplianceScore(companyId, { companyWide: true })
        : Promise.resolve({ enabled: false } as ComplianceScore),
      companyWide ? getTrainingCompletion(companyId) : Promise.resolve(null),
      getAuditsCompleted(companyId),
      getExpiringSoon(companyId),
      getComplianceCalendar(companyId),
      getRecentActivity(companyId),
      canSeeOnCall ? getUrgentFollowUps(companyId) : Promise.resolve([]),
    ]);

  const overdue = people.overdue + serviceUsers.overdue;
  const due14 = people.due14 + serviceUsers.due14;
  const healthy =
    score.enabled ? score.requirements.filter((r) => r.status === "green").length : 0;
  const scored = score.enabled ? score.requirements.filter((r) => r.score != null).length : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <RealtimeRefresh />
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{heading}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            Date range not wired
          </span>
          <Link href="/reports" className="btn-outline text-xs">
            Export report
          </Link>
        </div>
      </div>

      {/* Row one: the score, and the six figures beside it. */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="glass-card flex items-center gap-4 p-5 lg:col-span-4 lg:row-span-2">
          {score.enabled ? (
            <>
              <ScoreDial score={score.score} />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-white/50">Compliance score</p>
                <p className="mt-1 text-4xl font-bold text-white">
                  {score.score == null ? "Not scored" : `${score.score}%`}
                </p>
                <p className="text-sm font-semibold text-white/80">{score.label}</p>
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
            </>
          ) : (
            <div>
              <p className="text-xs uppercase tracking-wide text-white/50">Compliance score</p>
              <p className="mt-2 text-sm text-white/60">
                Inspection Readiness is not switched on for this company, so there is no score to
                show. Every other figure on this page is live.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8 xl:grid-cols-4">
          <Tile
            href="/people"
            label="Open actions"
            value={overdue}
            tone={overdue > 0 ? "red" : "green"}
            sub={`${people.overdue} people, ${serviceUsers.overdue} service users`}
          />
          <MissingTile label="Upcoming inspections" needs="Nothing records a scheduled inspection yet" />
          <Tile
            href="/people/training"
            label="Training completion"
            value={trainingPct == null ? "n/a" : `${Math.round(trainingPct)}%`}
            sub="of mandatory training is in date"
          />
          <MissingTile label="Policies up to date" needs="Needs signing coverage, not a policy count" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-8">
          <Tile
            href="/people"
            label="Audits completed"
            value={auditsPct == null ? "n/a" : `${auditsPct}%`}
            sub="audit checks currently in date"
          />
          <MissingTile label="Incidents (open)" needs="No incidents feature exists yet" />
          <MissingTile label="Risk level" needs="No risk model exists yet" />
        </div>
      </div>

      {/* Row two: readiness, on call, insights. */}
      <div className="grid gap-4 lg:grid-cols-12">
        {score.enabled ? (
          <Panel title="Inspection readiness" href="/readiness" linkLabel="View full report" className="lg:col-span-5">
            <ul className="space-y-2.5">
              {score.requirements.map((req) => (
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
            {scored > 0 ? (
              <p className="mt-4 border-t border-white/10 pt-3 text-xs text-white/60">
                {healthy} of {scored} areas healthy
              </p>
            ) : null}
          </Panel>
        ) : (
          <MissingPanel
            title="Inspection readiness"
            needs="Inspection Readiness is not switched on for this company."
          />
        )}

        <Panel title="On call: urgent follow ups" href="/on-call" className="lg:col-span-4">
          {!canSeeOnCall ? (
            <p className="text-sm text-white/55">On Call is not switched on for this company.</p>
          ) : onCallUrgent.length === 0 ? (
            <p className="text-sm text-white/55">Nothing urgent. Every call has been followed up.</p>
          ) : (
            <ul className="space-y-2">
              {onCallUrgent.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/on-call/log/${u.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]"
                  >
                    <span className="pill-amber shrink-0">
                      <span className="pill-dot" /> Urgent
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                      {shiftLabel(u.shift_date, u.slot)}
                    </span>
                    {u.branch_name ? (
                      <span className="shrink-0 text-xs text-white/45">{u.branch_name}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="lg:col-span-3">
          <MissingPanel
            title="AI compliance insights"
            needs="The AI layer exists for the readiness report but is not wired to run here yet."
          />
        </div>
      </div>

      {/* Row three: expiring, calendar, activity. */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Expiring soon" href="/people" className="lg:col-span-3">
          {expiring.length === 0 ? (
            <p className="text-sm text-white/55">Nothing runs out in the next 30 days.</p>
          ) : (
            <ul className="space-y-2">
              {expiring.map((e) => (
                <li
                  key={`${e.label}-${e.window}`}
                  className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 truncate text-sm text-white/80">
                    {e.count} {e.label}
                  </span>
                  <span
                    className={`shrink-0 text-[11px] ${
                      e.window === "Within 7 days" ? "text-amber-300" : "text-white/50"
                    }`}
                  >
                    {e.window}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Compliance calendar" href="/planner" linkLabel="View calendar" className="lg:col-span-5">
          {calendar.length === 0 ? (
            <p className="text-sm text-white/55">Nothing is due in the next 60 days.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-5">
              {calendar.map((d) => {
                const { day, date } = fmtDay(d.iso);
                return (
                  <div key={d.iso} className="rounded-xl border border-white/10 p-3">
                    <p className="text-[11px] font-semibold text-gold-300">{day}</p>
                    <p className="text-xs text-white/70">{date}</p>
                    <p className="mt-2 line-clamp-3 text-[11px] text-white/60">
                      {d.items.join(", ")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Recent activity" href="/reports" linkLabel="View all" className="lg:col-span-4">
          {activity.length === 0 ? (
            <p className="text-sm text-white/55">Nothing has happened yet today.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((a, i) => (
                <li
                  key={`${a.when}-${i}`}
                  className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 text-sm text-white/80">{a.summary}</span>
                  <span className="shrink-0 text-[11px] text-white/45">{fmtWhen(a.when)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
