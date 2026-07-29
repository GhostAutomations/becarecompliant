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
import { PLANNER_ROLES } from "@/lib/planner/data";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import type { PqsMeasure } from "@/lib/export/on-time";
import {
  getComplianceBuckets,
  getComplianceScore,
  getTrainingCompletion,
  getAuditsCompleted,
  getExpiringSoon,
  getPlannerWeek,
  getRecentActivity,
  getPqsSummary,
  getPqsScopes,
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

/**
 * The icon tiles from Phil's design. Plain inline paths, no icon library added: one dependency
 * for seven glyphs is not worth it, and these render at any size without a client component.
 */
const ICONS: Record<string, ReactNode> = {
  actions: (
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m-6 9 2 2 4-4" />
  ),
  calendar: <path d="M8 2v4m8-4v4M3 10h18M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
  training: <path d="M22 9 12 5 2 9l10 4 10-4Zm-4 3v5c0 1.5-2.7 3-6 3s-6-1.5-6-3v-5" />,
  policy: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 15h6M9 11h3" />,
  audit: <path d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  risk: <path d="M3 3v18h18M7 15v3m5-8v8m5-12v12" />,
};

const ICON_TONES: Record<string, string> = {
  indigo: "bg-indigo-500/20 text-indigo-200",
  orange: "bg-orange-500/20 text-orange-200",
  blue: "bg-sky-500/20 text-sky-200",
  green: "bg-emerald-500/20 text-emerald-200",
  red: "bg-red-500/20 text-red-200",
};

function TileIcon({ name, tone }: { name: string; tone: string }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONES[tone] ?? ICON_TONES.indigo}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden
      >
        {ICONS[name]}
      </svg>
    </span>
  );
}

/** A tile with real data behind it. Colour carries meaning: red overdue, amber due soon. */
function Tile({
  href,
  label,
  value,
  sub,
  tone = "none",
  icon,
  iconTone = "indigo",
  className = "",
}: {
  href?: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "red" | "amber" | "green" | "none";
  icon?: string;
  iconTone?: string;
  className?: string;
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
    <div className="flex h-full items-start gap-3">
      {icon ? <TileIcon name={icon} tone={iconTone} /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-white/55">{sub}</p> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className={`glass-card glass-card-hover block h-full p-4 ${className}`}>
      {inner}
    </Link>
  ) : (
    <div className={`glass-card h-full p-4 ${className}`}>{inner}</div>
  );
}

/**
 * A tile in the design that has NOTHING behind it yet.
 *
 * Deliberately loud. A greyed out placeholder gets ignored and then quietly ships; a red one
 * is a question every time the screen is opened. It says what is missing rather than showing
 * a zero, because a zero would be a wrong number rather than an absent one.
 */
function MissingTile({ label, needs, icon, className = "" }: { label: string; needs: string; icon?: string; className?: string }) {
  return (
    <div className={`h-full rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-4 ${className}`}>
      <div className="flex items-start gap-3">
        {icon ? <TileIcon name={icon} tone="red" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-red-200/80">{label}</p>
            <span className="shrink-0 rounded-full border border-red-400/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-200/80">
              No data
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-200/40">&mdash;</p>
          <p className="mt-0.5 text-[11px] text-red-200/70">{needs}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * A panel. Pass linkLabel={null} with an href and the WHOLE card becomes the link, with no
 * separate link in the corner (Phil, 2026-07-29). Only use that form when nothing inside the
 * panel is itself a link, because an anchor inside an anchor is invalid HTML and the browser
 * silently unnests it.
 */
function Panel({
  title,
  href,
  linkLabel = "View all",
  children,
  className = "",
}: {
  title: string;
  href?: string;
  linkLabel?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const wholeCard = Boolean(href) && linkLabel === null;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{title}</h2>
        {href && !wholeCard ? (
          <Link
            href={href}
            className="shrink-0 text-xs text-gold-300 underline underline-offset-4 hover:text-gold-400"
          >
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </>
  );

  if (wholeCard && href) {
    return (
      <Link
        href={href}
        aria-label={`${title}. Open the full report.`}
        className={`glass-card flex h-full flex-col p-4 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${className}`}
      >
        {body}
      </Link>
    );
  }

  return (
    <section className={`glass-card flex h-full flex-col p-4 ${className}`} aria-label={title}>
      {body}
    </section>
  );
}

/**
 * A white PQS score tile: one scope (the company, or a branch) with every measure it scores.
 *
 * White on purpose (Phil, 2026-07-29) so the scores lift off the navy. That means the LIGHT
 * theme rag inks: `rag-red` and `rag-amber` are #dc2626 and #b45309, drawn for white surfaces.
 * The dark surface variants used elsewhere on this page would be unreadable here.
 */
function ScoreTile({ name, measures }: { name: string; measures: PqsMeasure[] }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-lg shadow-black/20">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-navy-900" title={name}>
        {name}
      </p>
      <ul className="mt-2 space-y-1">
        {measures.map((m) => (
          <li key={`${m.name}-${m.register}`} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-slate-600" title={m.star}>
              {m.name}
            </span>
            <span
              className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                m.rate == null
                  ? "text-slate-400"
                  : m.rate >= 85
                    ? "text-rag-green"
                    : m.rate >= 50
                      ? "text-rag-amber"
                      : "text-rag-red"
              }`}
            >
              {m.rate == null ? "n/a" : `${m.rate}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissingPanel({ title, needs }: { title: string; needs: string }) {
  return (
    <section
      aria-label={title}
      className="h-full rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-200/80">{title}</h2>
        <span className="shrink-0 rounded-full border border-red-400/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200/80">
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
    <svg viewBox="0 0 140 140" className="h-20 w-20 shrink-0" aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="11" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 70 70)"
      />
      {/* The shield sits inside the ring, as in the design. It carries the score's colour, so
          the whole mark reads as one object rather than a ring with a logo dropped in it. */}
      <g transform="translate(70 70)" stroke={stroke} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d="M0 -22 L16 -16 V-2 C16 10 0 20 0 20 C0 20 -16 10 -16 -2 V-16 Z" />
        <path d="M-7 -3 L-2 2 L7 -7" />
      </g>
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
  const { user, profile } = await requireCompany();
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
  const canSeePqs = await featureEnabled(companyId, "outcomes_satisfaction");
  // The Planner tile shows THIS user's planner, so it is drawn only for someone who has one:
  // the same roles the Planner page allows, and only when the feature is on.
  const canSeePlanner =
    PLANNER_ROLES.includes(profile.role) && (await featureEnabled(companyId, "planner"));

  const { people, serviceUsers } = await getComplianceBuckets(companyId);
  const [score, trainingPct, auditsPct, expiring, plannerWeek, activity, onCallUrgent] =
    await Promise.all([
      companyWide
        ? getComplianceScore(companyId, { companyWide: true })
        : Promise.resolve({ enabled: false } as ComplianceScore),
      companyWide ? getTrainingCompletion(companyId) : Promise.resolve(null),
      getAuditsCompleted(companyId),
      getExpiringSoon(companyId),
      canSeePlanner ? getPlannerWeek(user.id) : Promise.resolve([]),
      getRecentActivity(companyId),
      canSeeOnCall ? getUrgentFollowUps(companyId) : Promise.resolve([]),
    ]);
  const { data: coRow } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  const pqs = canSeePqs ? await getPqsSummary(companyId, coRow?.name ?? "Company") : null;
  // The white score tiles: the company and every branch this user can see. Only computed when
  // there are measures to show, since each extra branch is a full run of the PQS engine.
  const pqsScopes =
    pqs && pqs.length > 0
      ? await getPqsScopes(
          companyId,
          coRow?.name ?? "Company",
          pqs,
          (await listAccessibleBranchTypes(companyId, profile.role, user.id)).map((b) => ({
            id: b.id,
            name: b.name,
          })),
        )
      : [];

  const overdue = people.overdue + serviceUsers.overdue;
  const due14 = people.due14 + serviceUsers.due14;
  const healthy =
    score.enabled ? score.requirements.filter((r) => r.status === "green").length : 0;
  const scored = score.enabled ? score.requirements.filter((r) => r.score != null).length : 0;

  return (
    <div className="w-full space-y-4">
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
        {/* The dial sits BESIDE the percentage, and the breakdown row runs full width beneath
            both, so there is no dead column under the ring. */}
        <div className="glass-card flex flex-col justify-center gap-4 p-5 lg:col-span-2 lg:row-span-2">
          {score.enabled ? (
            <>
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-white/50">Compliance score</p>
                  <p className="mt-1 text-3xl font-bold leading-none text-white">
                    {score.score == null ? "Not scored" : `${score.score}%`}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-300">{score.label}</p>
                  <p className="text-xs text-white/55">
                    {score.score != null && score.score >= 85
                      ? "Inspection ready"
                      : "Evidence still to gather"}
                  </p>
                  {/* Never "since yesterday": snapshots are written when the readiness report is
                      opened, so the line names the day it actually measures from. */}
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
                </div>
                <ScoreDial score={score.score} />
              </div>
              <Link
                href="/readiness"
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gold-300 transition hover:bg-white/[0.08]"
              >
                Score breakdown
                <span aria-hidden>&rsaquo;</span>
              </Link>
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

        {/* Ten columns, not four equal ones. A tile holding a number and four words does
              not need the same width as one holding a sentence, and forcing them equal is what
              left the dead band down the side of Open actions and Audits completed. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-10 xl:grid-cols-12">
          <Tile
            href="/people"
            label="Open actions"
            className="xl:col-span-2"
            icon="actions"
            iconTone="indigo"
            value={overdue}
            tone={overdue > 0 ? "red" : "green"}
            sub={`${people.overdue} people, ${serviceUsers.overdue} service users`}
          />
          <MissingTile label="Upcoming inspections"
            className="xl:col-span-3"
            needs="Nothing records a scheduled inspection yet"
            icon="calendar" />
          <Tile
            href="/people/training"
            label="Training completion"
            className="xl:col-span-3"
            icon="training"
            iconTone="blue"
            value={trainingPct == null ? "n/a" : `${Math.round(trainingPct)}%`}
            sub="of mandatory training is in date"
          />
          <MissingTile label="Policies up to date"
            className="xl:col-span-4"
            needs="Needs signing coverage, not a policy count"
            icon="policy" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-10 xl:grid-cols-12">
          <Tile
            href="/people"
            label="Audits completed"
            className="xl:col-span-2"
            icon="audit"
            iconTone="indigo"
            value={auditsPct == null ? "n/a" : `${auditsPct}%`}
            sub="audit checks currently in date"
          />
          <MissingTile label="Incidents (open)"
            className="xl:col-span-3"
            needs="No incidents feature exists yet"
            icon="shield" />
          <MissingTile label="Risk level"
            className="xl:col-span-3"
            needs="No risk model exists yet"
            icon="risk" />
          {/* Eight tiles in an eight slot grid. Seven left a hole on the right, and stretching
              three tiles to fill it made them a third wider than the other four. */}
          <Tile
            href="/people"
            label="Due in 14 days"
            className="xl:col-span-4"
            value={due14}
            tone={due14 > 0 ? "amber" : "green"}
            sub="checks falling due across both registers"
            icon="calendar"
            iconTone="orange"
          />
        </div>
      </div>

      {/* Rows two and three are ONE grid (Phil, 2026-07-29) so the PQS report can span both:
          it takes the five columns on the left for the full height, On call and Expiring soon
          sit beside it on the top row, the Planner and Recent activity on the bottom row. */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* THE PQS REPORT, not Inspection Readiness (Phil, 2026-07-29). Both figures are read
            from the SAME functions the real PQS report uses, so the two can never quote
            different numbers. The on time completion measures are deliberately not recomputed
            here: that logic lives in the report builder, and a second copy of it is exactly how
            the Evidence page and the Evidence PDF came to disagree. */}
        {/* THE PQS REPORT. Every measure Cardiff scores, from the SAME computation the report
            renders (lib/export/on-time getPqsMeasures), so the dashboard and the report can
            never disagree. The link goes to the report itself, not the reports index. */}
        {pqs && pqs.length > 0 ? (
          <Panel
            title="PQS report"
            href="/reports/view/on-time"
            linkLabel={null}
            className="lg:col-span-5 lg:row-span-2"
          >
            {/* Two by two (Phil, 2026-07-29). The white tiles ARE the report now: the bar list
                that used to sit under them said the same thing twice, so it is gone. More than
                four scopes and the grid scrolls rather than shrinking the tiles. */}
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  {pqsScopes.map((sc) => (
                    <ScoreTile key={sc.key} name={sc.name} measures={sc.measures} />
                  ))}
                </div>
              </div>
              <p className="mt-3 shrink-0 border-t border-white/10 pt-2.5 text-[11px] text-white/50">
                Completion rate over the last six months. Open this tile for the full report.
              </p>
            </div>
          </Panel>
        ) : (
          <div className="lg:col-span-5 lg:row-span-2">
            <MissingPanel
              title="PQS report"
              needs={
                canSeePqs
                  ? "No recurring checks are configured yet, so there is nothing to score."
                  : "Personal outcomes and satisfaction are Pro features and are not switched on for this company."
              }
            />
          </div>
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

        {/* THE PLANNER (Phil, 2026-07-29): this user's own booked tasks, the same rows the
            Planner page reads, as five WORKING day columns. Every column is always drawn, empty
            or not, so the week keeps its shape. */}
        <Panel
          title="Planner"
          href={canSeePlanner ? "/planner" : undefined}
          linkLabel="View planner"
          className="lg:col-span-4 lg:col-start-6"
        >
          {!canSeePlanner ? (
            <p className="text-sm text-white/55">
              The Planner is not switched on for you, so there is nothing booked to show.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-5 divide-x divide-white/10">
                {plannerWeek.map((d) => {
                  const { day, date } = fmtDay(d.iso);
                  const isToday = day === "Today";
                  return (
                    <div key={d.iso} className="min-w-0 px-2 first:pl-0 last:pr-0">
                      <p
                        className={`truncate text-[11px] font-semibold uppercase tracking-wide ${
                          isToday ? "text-gold-300" : "text-white/60"
                        }`}
                      >
                        {day}
                      </p>
                      <p className="truncate text-[11px] tabular-nums text-white/45">{date}</p>
                      {/* Every booking is here. The column scrolls when there are more than a
                          couple, so a busy day is never truncated to a "+N more" you cannot
                          open. */}
                      <ul className="mt-2 max-h-[88px] space-y-1.5 overflow-y-auto pr-0.5">
                        {d.items.length === 0 ? (
                          <li className="text-[11px] text-white/30">Clear</li>
                        ) : (
                          d.items.map((it, i) => (
                            <li
                              key={`${d.iso}-${i}`}
                              title={[it.dayHint, it.time ?? "No time set", it.label, it.subject]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <span className="block truncate text-[10px] tabular-nums text-gold-300/85">
                                {it.dayHint ? `${it.dayHint} ` : ""}
                                {it.time ?? "No time"}
                              </span>
                              <span className="block truncate text-[11px] text-white/70">
                                {it.label}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/45">
                Your booked tasks. Weekend bookings show on the next working day.
              </p>
            </>
          )}
        </Panel>
        <Panel title="Recent activity" href="/reports" linkLabel="View all" className="lg:col-span-3">
          {activity.length === 0 ? (
            <p className="text-sm text-white/55">Nothing has happened yet today.</p>
          ) : (
            <div className="max-h-[124px] overflow-y-auto pr-1">
              <ul className="space-y-2">
                {activity.map((a, i) => (
                  <li
                    key={`${a.when}-${i}`}
                    className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="min-w-0 text-[13px] leading-snug text-white/80">{a.summary}</span>
                    <span className="shrink-0 text-[11px] text-white/45">{fmtWhen(a.when)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
