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
import { defaultOnTimeWindow } from "@/lib/export/on-time";
import { getComplaintCounts } from "@/lib/complaints/data";
import { getIncidentActions } from "@/lib/incidents/data";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import type { PqsMeasure } from "@/lib/export/on-time";
import {
  getComplianceBuckets,
  getComplianceScore,
  getTrainingCompletion,
  getPolicyCoverage,
  getAuditsCompleted,
  getDueSoon,
  getPlannerWeek,
  getRecentActivity,
  getPqsSummary,
  getPqsScopes,
  getAbsenceActions,
  getPendingHolidayApprovals,
  getSpendThisMonth,
  type ComplianceScore,
} from "@/lib/dashboard/data";

/**
 * The dashboard, rebuilt to Phil's Mission Control design (2026-07-29).
 *
 * THE RULE HE SET: every tile in the design gets built. The ones that have real data behind
 * them are plumbed in. The ones that do not are drawn in RED, so the gap is visible on the
 * screen instead of quietly missing from it. A red tile is a to do list item you can see.
 *
 * RED TODAY: only Complaints, and only when a company is not on a tier that includes it. Every
 * other tile carries a live figure as of 31 Jul 2026. Keep it that way: a tile with no data
 * behind it goes RED rather than showing a zero, because a zero is a wrong number and red is an
 * absent one.
 *
 * The old Complaints, Holidays and Absence strips were REMOVED on instruction, since they are not
 * in the design. All three came back on 30 Jul as single tiles carrying the one figure that is
 * somebody's job right now, in the slots the tiles with no data behind them used to hold:
 * Complaints for Incidents, Holiday for Upcoming inspections, Absences for Risk level.
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

/**
 * Who may see the Complaints tile. Identical to MANAGE_ROLES on the Complaints register, because
 * complaints hold special category data and a role that cannot open the register must not be
 * shown a count from it. RLS would hand a Supervisor an empty set, and an empty set rendered as
 * "0 complaints" is a lie by omission.
 */
/** The Incidents tile is drawn for exactly the roles the Incidents register admits. Any
 *  wider and a Supervisor reads a zero and takes it to mean nothing is outstanding, when it
 *  means the rows were never visible to them. */
const INCIDENT_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

const COMPLAINTS_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "on_call",
  "platform_admin",
];

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
  /*
   * FIXED GEOMETRY (Phil, 2026-07-30). Every tile on this row must put its number at the same
   * height and its caption at the same height, whatever the length of either. So: the label is
   * one line and truncates, the number has a fixed size and line height, and the caption sits in
   * a block with a fixed minimum height. Anything left over falls at the BOTTOM of the tile,
   * where it does not push the two things a manager actually compares out of line.
   */
  const inner = (
    <div className="flex h-full items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-xs uppercase tracking-wide text-white/50">{label}</p>
        <p className={`mt-2 text-[40px] font-bold leading-none tabular-nums ${valueClass}`}>
          {value}
        </p>
        {/* mt-auto: the caption sits on the FLOOR of the tile, so the slack lands between the
            number and the caption rather than as a dead band underneath. items-end puts the last
            line of a one line and a two line caption on the same baseline, which is what keeps
            the eight tiles reading level. */}
        <div className="mt-auto flex h-[30px] items-end text-[11px] leading-snug text-white/55">
          {sub}
        </div>
      </div>
      {/* Top RIGHT (Phil, 2026-07-30). Same element, same size, last in the row instead of
          first, so nothing about the tile's shape changes. */}
      {icon ? <TileIcon name={icon} tone={iconTone} /> : null}
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
 * A tile carrying TWO figures side by side, each centred over its own label.
 *
 * Absences is two separate jobs (invites to send, Return to Works to complete) and adding them
 * into one headline hid which of the two was actually waiting on you.
 */
function SplitTile({
  href,
  label,
  pairs,
  icon,
  iconTone = "indigo",
  className = "",
}: {
  href?: string;
  label: string;
  /*
   * A pair may carry its own href. Two figures merged into one tile are still two places to go,
   * and a card level link would have to pick one of them; an anchor inside an anchor is invalid
   * HTML that the browser silently unnests. So when a pair has an href, the HALF is the link and
   * the card is a plain div.
   */
  pairs: Array<{
    value: ReactNode;
    caption: string;
    tone?: "red" | "amber" | "green" | "none";
    href?: string;
  }>;
  icon?: string;
  iconTone?: string;
  className?: string;
}) {
  const ink = (tone?: string) =>
    tone === "red"
      ? "text-red-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "green"
          ? "text-emerald-300"
          : "text-white";
  /*
   * The SAME geometry as Tile: label on one line, numbers on one baseline, captions starting at
   * the same offset, so a split tile lines up with the single figure tiles beside it.
   *
   * TWO FIGURES IN A TWO COLUMN TILE IS ABOUT 45px A SIDE on a narrow window, and nothing here
   * was told what to do about that: the figure kept Tile's 40px, the caption had a fixed height
   * and no way to wrap, and neither had min-w-0, so both simply overflowed their half and ran
   * into the other one. "100%" and "39%" printed as "1039%".
   *
   * Fixed by giving the tile a MINIMUM WIDTH rather than by shrinking the type: at 19rem a half
   * is 104px, "100%" at 40px is 94px, and there is a rule and 12px between them, so nothing is a
   * different size from anything else. The one step down is for a phone, where a tile is the
   * whole screen and 40px twice over will not fit. Never truncated: a clipped "10…" where a
   * compliance percentage should be is a wrong number, which is the one thing this dashboard
   * keeps trying not to print. Captions wrap instead of overflowing and have a floor rather than
   * a fixed height. Keep them to a word or two: the sentence belongs on the screen it opens.
   */
  const inner = (
    <div className="flex h-full items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-xs uppercase tracking-wide text-white/50">{label}</p>
        {/*
            A LINE BETWEEN THEM, and room to breathe. Measured, "100%" and "39%" each fitted
            their half with 8px to spare and no overflow flag anywhere — and on the screen they
            read as one number, 10039%, because nothing separated them. Fitting is not the same
            as reading as two figures.
         */}
        <div className="mt-2 flex flex-1 justify-between gap-3 divide-x divide-white/10">
          {pairs.map((p) => {
            const half = (
              <>
                <p
                  className={`min-w-0 text-[24px] font-bold leading-none tabular-nums @[14rem]:text-[40px] ${ink(p.tone)}`}
                >
                  {p.value}
                </p>
                <p className="mt-auto flex min-h-[30px] min-w-0 items-end justify-center text-balance break-words text-[10px] leading-snug text-white/55 @[13rem]:text-[11px]">
                  {p.caption}
                </p>
              </>
            );
            return p.href ? (
              <Link
                key={p.caption}
                href={p.href}
                className="flex min-w-0 flex-1 flex-col rounded-lg px-1 text-center transition hover:bg-white/[0.06]"
              >
                {half}
              </Link>
            ) : (
              <div key={p.caption} className="flex min-w-0 flex-1 flex-col text-center">
                {half}
              </div>
            );
          })}
        </div>
      </div>
      {/* Top right, matching Tile. */}
      {icon ? <TileIcon name={icon} tone={iconTone} /> : null}
    </div>
  );
  const halvesLink = pairs.some((p) => p.href);
  // @container: the figures size themselves off THIS card, not the viewport.
  return href && !halvesLink ? (
    <Link href={href} className={`glass-card glass-card-hover @container block h-full p-4 ${className}`}>
      {inner}
    </Link>
  ) : (
    <div className={`glass-card @container h-full p-4 ${className}`}>{inner}</div>
  );
}

/**
 * A tile in the design that has NOTHING behind it yet.
 *
 * Deliberately loud. A greyed out placeholder gets ignored and then quietly ships; a red one
 * is a question every time the screen is opened. It says what is missing rather than showing
 * a zero, because a zero would be a wrong number rather than an absent one.
 */
function MissingTile({
  label,
  needs,
  icon,
  className = "",
  badge = "No data",
  value,
}: {
  label: string;
  needs: string;
  icon?: string;
  className?: string;
  /** The pill in the corner. "No data" by default; pass something else when the tile is red for a
   *  reason other than absent data, e.g. a feature that is not on this tier. */
  badge?: string;
  /** A real figure, when the tile has one and is still red for a different reason. */
  value?: ReactNode;
}) {
  return (
    <div className={`h-full rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-xs uppercase tracking-wide text-red-200/80">{label}</p>
            <span className="shrink-0 rounded-full border border-red-400/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-200/80">
              {badge}
            </span>
          </div>
          {/* Same geometry as Tile, so a red tile sits in line with the live ones beside it. */}
          <p
            className={`mt-2 text-[40px] font-bold leading-none tabular-nums ${
              value == null ? "text-red-200/40" : "text-red-200"
            }`}
          >
            {value == null ? <>&mdash;</> : value}
          </p>
          <p className="mt-auto flex h-[30px] items-end text-[11px] leading-snug text-red-200/70">
            {needs}
          </p>
        </div>
        {/* Top right, matching Tile. The badge keeps its place beside the label. */}
        {icon ? <TileIcon name={icon} tone="red" /> : null}
      </div>
    </div>
  );
}

/**
 * A panel: a title, an optional corner link, and a body that fills the card.
 *
 * The whole card link form is GONE (2026-07-30). It existed for the PQS panel, whose white tiles
 * are now links in their own right, and keeping it would have invited an anchor inside an anchor:
 * invalid HTML that the browser silently unnests.
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
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card flex h-full flex-col p-4 ${className}`} aria-label={title}>
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
      <div className="mt-4 min-h-0 flex-1">{children}</div>
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
function ScoreTile({
  name,
  measures,
  href,
  className = "",
}: {
  name: string;
  measures: PqsMeasure[];
  /** That scope's own PQS report: a branch, or all branches for the company tile. */
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-navy-900" title={name}>
        {name}
      </p>
      <ul className="mt-2 space-y-1">
        {measures.map((m) => {
          /*
           * ONE rag decision per line, shared by the rate and the score, so the two numbers can
           * never contradict each other.
           *
           * Coloured by the PQS BAND, not the rate (Phil, 2026-07-30). Cardiff awards 10, 7, 5,
           * 2 or 0, and only a 10 is full marks: 10 green, 7 amber, everything else red. A rate
           * of 84% "feeling" amber is beside the point when the return scores it a 5.
           */
          const ink =
            m.band == null
              ? "text-slate-400"
              : m.band === 10
                ? "text-rag-green"
                : m.band === 7
                  ? "text-rag-amber"
                  : "text-rag-red";
          return (
          <li key={`${m.name}-${m.register}`} className="flex items-baseline justify-between gap-1.5">
            {/* The name takes the slack, so both number columns pin to the right edge and read
                as columns down the tile instead of drifting with the length of each label. */}
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={m.star}>
              {m.name}
            </span>
            <span className={`w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums ${ink}`}>
              {m.rate == null ? "n/a" : `${m.rate}%`}
            </span>
            {/* The PQS score (the band Cardiff awards: 0, 2, 5, 7 or 10) sits to the RIGHT of the
                rate and carries the SAME ink as it (Phil, 2026-07-30), so a line reads as one
                judgement rather than two. */}
            <span
              className={`w-5 shrink-0 text-right text-[11px] font-bold tabular-nums ${ink}`}
              title="PQS score"
            >
              {m.band == null ? "" : m.band}
            </span>
          </li>
          );
        })}
      </ul>
    </>
  );

  const skin = `rounded-xl bg-white p-3 shadow-lg shadow-black/20 ${className}`;
  return href ? (
    <Link
      href={href}
      aria-label={`${name}. Open the PQS report for this scope.`}
      className={`${skin} block transition hover:shadow-xl hover:ring-2 hover:ring-gold-300/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300`}
    >
      {body}
    </Link>
  ) : (
    <div className={skin}>{body}</div>
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

/** 30 Jan 2026. Used for the PQS window, so the panel names the days it is actually measuring. */
function fmtWindowDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
  // The report viewer admits exactly these roles, so nothing else is given a link into it.
  const canOpenReports = MANAGER_PLUS_ROLES.includes(profile.role);
  const canSeeOnCall = companyWide && (await featureEnabled(companyId, "on_call"));
  const canSeePqs = await featureEnabled(companyId, "outcomes_satisfaction");
  // The Planner tile shows THIS user's planner, so it is drawn only for someone who has one:
  // the same roles the Planner page allows, and only when the feature is on.
  const canSeePlanner =
    PLANNER_ROLES.includes(profile.role) && (await featureEnabled(companyId, "planner"));
  // Complaints hold special category data, so the tile is drawn for exactly the roles the
  // Complaints register itself admits, and only when the feature is on. Anything less and a
  // Supervisor would read a zero and take it to mean there are no complaints.
  const canSeeComplaints =
    COMPLAINTS_ROLES.includes(profile.role) && (await featureEnabled(companyId, "complaints"));
  // No feature gate: recording an incident is a legal duty on every tier, Business included.
  const canSeeIncidents = INCIDENT_ROLES.includes(profile.role);

  const { people, serviceUsers } = await getComplianceBuckets(companyId);
  const [
    score,
    trainingPct,
    policyCoverage,
    auditsPct,
    dueSoon,
    plannerWeek,
    complaints,
    incidentActions,
    absenceActions,
    holidaysPending,
    spend,
    activity,
    onCallUrgent,
  ] =
    await Promise.all([
      companyWide
        ? getComplianceScore(companyId, { companyWide: true })
        : Promise.resolve({ enabled: false } as ComplianceScore),
      companyWide ? getTrainingCompletion(companyId) : Promise.resolve(null),
      // Company wide only, like training: policy coverage is a company obligation and a
      // branch slice of it would answer a question nobody asked.
      companyWide ? getPolicyCoverage(companyId) : Promise.resolve(null),
      getAuditsCompleted(companyId),
      getDueSoon(companyId),
      canSeePlanner ? getPlannerWeek(user.id) : Promise.resolve([]),
      canSeeComplaints
        ? getComplaintCounts(companyId)
        : Promise.resolve(null as Awaited<ReturnType<typeof getComplaintCounts>> | null),
      canSeeIncidents
        ? getIncidentActions(companyId)
        : Promise.resolve(null as Awaited<ReturnType<typeof getIncidentActions>> | null),
      getAbsenceActions(companyId),
      getPendingHolidayApprovals(companyId),
      // Admin only: both sources are Admin only by RLS, and a Manager reading them would get
      // zeros that look like "nothing spent" rather than "not your business".
      profile.role === "company_admin" || profile.role === "platform_admin"
        ? getSpendThisMonth(companyId)
        : Promise.resolve(null as Awaited<ReturnType<typeof getSpendThisMonth>> | null),
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

  const pqsWindow = defaultOnTimeWindow();
  const overdue = people.overdue + serviceUsers.overdue;
  /*
   * SMS and AI are Admin only, so the row has to work with and without them. With: four tiles
   * narrow to two columns each to make room, and both rows still total twelve. Without: those
   * four keep the three columns they had, and a Manager sees exactly the layout they saw before,
   * rather than a hole where two tiles they may not read would have been.
   */

  const healthy =
    score.enabled ? score.requirements.filter((r) => r.status === "green").length : 0;
  const scored = score.enabled ? score.requirements.filter((r) => r.score != null).length : 0;

  return (
    <div className="w-full space-y-3">
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
          {/* The date range chip is gone (Phil, 2026-07-30): every figure on this page is live and
              nothing was ever going to filter by period. "Reports" rather than "Export report",
              because the button opens the Reports page, it does not export anything. */}
          <Link href="/reports" className="btn-outline text-xs">
            Reports
          </Link>
        </div>
      </div>

      {/* Row one: the score, and the eight figures beside it. */}
      <div className="grid gap-3 lg:grid-cols-12">
        {/* The dial sits BESIDE the percentage, and the breakdown row runs full width beneath
            both, so there is no dead column under the ring. */}
        {/* NO row span. It had one from when the tiles were two separate blocks; they are one
            block now, so spanning two rows made the score card taller than everything beside it,
            which is exactly the misalignment down the top of the page. One row, one height. */}
        {/* justify-between, not justify-center: the card is as tall as the tile block beside it,
            and centring left a dead band top and bottom. Now the figure sits at the top and the
            breakdown link on the floor. */}
        {/*
            THREE TWELFTHS BELOW 2xl, TWO ABOVE. Two twelfths of a 1150px window is about 120px,
            and this card carries sentences, not a figure: "Down 1 since 10 Aug" was breaking one
            word to a line. The first cut of this rule switched at xl, but a 13 inch MacBook is
            exactly 1280, and two twelfths there is ~200px: the ring sat on top of the words
            (seen live, 17 Aug QA). 2xl keeps the third column through the laptop widths and
            gives it back on big monitors, where two twelfths genuinely is wide enough.
         */}
        <div className="glass-card flex flex-col justify-between gap-3 p-5 lg:col-span-3 2xl:col-span-2">
          {score.enabled ? (
            <>
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-white/50">Compliance score</p>
                  <p className="mt-1 text-[44px] font-bold leading-none text-white">
                    {score.score == null ? "Not scored" : `${score.score}%`}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-300">{score.label}</p>
                  {/* What the number is measured OVER. "Inspection ready" used to sit here, which
                      claimed a great deal more than an average of the mapped requirements can
                      carry, and said nothing about the checks with no due date that the score
                      cannot see. */}
                  {score.score != null ? (
                    <>
                      <p className="text-xs text-white/55">
                        Over {score.coverage.scored} scheduled{" "}
                        {score.coverage.scored === 1 ? "check" : "checks"}
                      </p>
                      {score.coverage.unscheduled > 0 ? (
                        <p className="text-xs text-amber-300">
                          {score.coverage.unscheduled} not scheduled, so not scored
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-white/55">Nothing is mapped to score yet</p>
                  )}
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
          {/* grid-rows-2 and h-full: the two tile rows split the column evenly and fill it, so
              the block ends exactly level with the score card beside it. Without it the rows size
              to their content and the two columns finish at different heights. */}
          {/*
            * THE TILES DIVIDE THE ROW BETWEEN THEM, they are not each pinned to a fixed number
            * of twelfths (2026-08-17). Hand counted spans were what broke this block twice: it
            * was exact at eight tiles on 30 July, two more arrived on 11 and 12 August, and
            * nobody redid the arithmetic, so it spilled into a third row with holes in the two
            * above. Then merging to get back to eight made every tile narrower than the figures
            * inside it, so a two figure tile printed 100% and 39% as 1039%.
            *
            * The tiles now WRAP and STRETCH. Each one asks for at least 15rem and takes an equal
            * share of whatever is left, so a row is always completely full whatever the tier and
            * the role turn on, and a tile is never narrower than the figures inside it. That
            * minimum is the whole point: half of a 19rem tile holds "100%" at the full 40px with
            * a two figure tile reads at exactly the same size as the single figure tile beside
            * it. Eight tiles land three, three and two; six land three and three.
            */}
          <div className="flex flex-col gap-3 lg:col-span-9 2xl:col-span-10 xl:flex-row">
          {/*
            * content-start AND h-auto, or the tiles are 548px tall. Two separate causes, and
            * fixing only the first changed nothing: the lines were stretching to split the
            * height of the On call panel beside them, AND every tile carries h-full, which
            * resolves against a container the outer row has already stretched. The arbitrary
            * child selector outranks the h-full inside the tile. Both found by taking a
            * screenshot; the measurements I ran first asked about type and overflow and came
            * back clean, because I never asked about height.
            */}
          <div className="flex flex-1 flex-wrap content-start gap-3 [&>*]:h-auto [&>*]:min-w-[19rem] [&>*]:flex-1">
          <Tile
            href="/people"
            label="Open actions"
            icon="actions"
            iconTone="indigo"
            value={overdue}
            tone={overdue > 0 ? "red" : "green"}
            sub={`${people.overdue} people, ${serviceUsers.overdue} service users`}
          />
          {/* Holidays, in place of the Upcoming inspections tile nothing feeds (Phil, 2026-07-30).
              Pending requests are the only holiday figure that is somebody's job right now. */}
          <Tile
            href="/people/holiday"
            label="Holiday"
            icon="calendar"
            iconTone="blue"
            value={holidaysPending}
            tone={holidaysPending > 0 ? "amber" : "green"}
            sub="waiting approval"
          />
          {/* SMS and AI, in the dead space Holiday and Complaints were carrying (Phil,
              2026-07-30). Both count down against a monthly allowance by tier; SMS got one on
              31 Jul, which is what took this tile from red to live. */}
          {spend ? (
            /* LIVE (2026-07-31). The tile was red while sending had no allowance to count down
               from. It has one now, so it reads like AI credits: sent this month, and left. */
            <SplitTile
              href="/settings/billing"
              label="SMS"
                icon="policy"
              iconTone="blue"
              pairs={[
                { value: spend.sms.sent, caption: "Sent" },
                {
                  value: spend.sms.remaining ?? "n/a",
                  caption: "Left",
                  // Against the tier's OWN grant, so "running low" means the same on Pro (100 a
                  // month) as on Black (2000). A tier with no allowance at all is not "running
                  // low", it is simply not on the plan, so it stays uncoloured.
                  tone:
                    spend.sms.remaining == null ||
                    (spend.sms.monthlyGrant === 0 && spend.sms.sent === 0)
                      ? "none"
                      : spend.sms.remaining === 0
                        ? "red"
                        : spend.sms.monthlyGrant &&
                            spend.sms.remaining < spend.sms.monthlyGrant * 0.25
                          ? "amber"
                          : "green",
                },
              ]}
            />
          ) : null}
          {/*
            * ONE tile, two figures (2026-08-17). Policies up to date arrived on 11 Aug and
            * Incidents awaiting action on 12 Aug, into a block whose arithmetic was already
            * exact: On call is four columns by two rows, which leaves sixteen slots, which is
            * eight tiles. Ten tiles wanted twenty eight slots against twenty four, so the block
            * silently spilled into a third row and left holes in the two above it. Merging the
            * two pairs that answer one question each puts it back to eight, and each half keeps
            * its own link because they are still two places to go.
            */}
          <SplitTile
            label="Up to date"
            icon="policy"
            iconTone="blue"
            pairs={[
              {
                value:
                  policyCoverage == null || policyCoverage.pct == null
                    ? "n/a"
                    : `${Math.floor(policyCoverage.pct)}%`,
                caption: "Policies",
                href: "/briefings/coverage",
              },
              {
                // Math.floor, not Math.round: the figure arrives floored to one decimal, and
                // rounding it back up here would undo that on the most looked at screen.
                value: trainingPct == null ? "n/a" : `${Math.floor(trainingPct)}%`,
                caption: "Training",
                href: "/people/training",
              },
            ]}
          />
          <Tile
            href="/people"
            label="Audits completed"
            icon="audit"
            iconTone="indigo"
            value={auditsPct == null ? "n/a" : `${auditsPct}%`}
            sub="audits in date"
          />
          {/*
            * The second merged pair. Both halves are the same question — what is outstanding and
            * could put this provider in front of the regulator — and each keeps its own link.
            *
            * A half with nothing behind it reads "n/a" and says why, rather than dropping out of
            * the tile: a missing tile changes the width of the row, and a row whose width depends
            * on the tier is how this block came apart in the first place.
            */}
          <SplitTile
            label="Awaiting action"
            icon="risk"
            iconTone="red"
            pairs={[
              {
                /* THE OUTSTANDING DUTY IS THE HEADLINE, not the number of open incidents. A
                   notifiable incident with no notification date is the one thing on this screen
                   that can put a provider in front of the regulator, and it stays counted after
                   the incident is closed. */
                value: incidentActions == null ? "n/a" : incidentActions.awaiting,
                caption: "Incidents",
                tone:
                  incidentActions == null
                    ? "none"
                    : incidentActions.awaiting > 0
                      ? "red"
                      : "green",
                href: "/incidents",
              },
              {
                value: complaints == null ? "n/a" : complaints.open + complaints.inProgress,
                caption: "Complaints",
                tone:
                  complaints == null
                    ? "none"
                    : complaints.overdue > 0
                      ? "red"
                      : complaints.open + complaints.inProgress > 0
                        ? "amber"
                        : "green",
                href: "/complaints",
              },
            ]}
          />
          {spend ? (
            <SplitTile
              href="/settings/billing"
              label="AI credits"
                icon="training"
              iconTone="indigo"
              pairs={[
                { value: spend.ai.used, caption: "Used" },
                {
                  value: spend.ai.remaining ?? "n/a",
                  caption: "Left",
                  /*
                   * Against the tier's OWN monthly grant, read from the function that issues it,
                   * so "running low" means the same thing on Business (25 a month) as on Black
                   * (1000). No grant known, no colour: a red zero on an unreadable balance is
                   * exactly the wrong number this dashboard keeps trying not to print.
                   */
                  tone:
                    spend.ai.remaining == null
                      ? "none"
                      : spend.ai.remaining === 0
                        ? "red"
                        : spend.ai.monthlyGrant && spend.ai.remaining < spend.ai.monthlyGrant * 0.25
                          ? "amber"
                          : "green",
                },
              ]}
            />
          ) : null}
          {/* Absences, in place of the Risk level tile there is no model for (Phil, 2026-07-30).
              TWO figures, each centred over its own caption: they are two separate jobs, and one
              combined headline hid which of them was waiting on you. */}
          <SplitTile
            href="/people/absence"
            label="Absences"
            icon="risk"
            iconTone="orange"
            pairs={[
              {
                value: absenceActions.invites,
                caption: "Invites to send",
                tone: absenceActions.invites > 0 ? "amber" : "green",
              },
              {
                value: absenceActions.rtw,
                caption: "Return to works due",
                // Red only when one is actually past its due date, not merely outstanding.
                tone:
                  absenceActions.rtwOverdue > 0
                    ? "red"
                    : absenceActions.rtw > 0
                      ? "amber"
                      : "green",
              },
            ]}
          />
          </div>
          {/* On call sits BESIDE the tiles rather than inside their grid (Phil, 2026-07-30: the
              urgent follow ups belong at the top of the screen). Out here it keeps its own width
              whatever the tile count is, instead of taking slots the tiles are counting. */}
          <div className="shrink-0 xl:w-[21rem]">
        {/* On call and Due in 14 days swapped (Phil, 2026-07-30): the urgent follow ups
              belong at the top of the screen, in the four column slot that runs down both tile
              rows. */}
          <Panel
            title="On call: urgent follow ups"
            href="/on-call"
            className="h-full"
          >
          {!canSeeOnCall ? (
            <p className="text-sm text-white/55">On Call is not switched on for this company.</p>
          ) : onCallUrgent.length === 0 ? (
            <p className="text-sm text-white/55">Nothing urgent. Every call has been followed up.</p>
          ) : (
            /* FIVE, and NOT scrollable (Phil, 2026-07-30). The fifth row goes in the space that
               was sitting empty at the bottom of the panel. The "View all" link in the corner is
               the way to the rest. */
            <ul className="space-y-2">
              {onCallUrgent.slice(0, 5).map((u) => (
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
              {onCallUrgent.length > 5 ? (
                <li className="pt-0.5 text-[11px] text-white/45">
                  {onCallUrgent.length - 5} more waiting
                </li>
              ) : null}
            </ul>
          )}
        </Panel>
          </div>
        </div>
      </div>

      {/* Rows two and three are ONE grid (Phil, 2026-07-29) so the PQS report can span both:
          it takes the five columns on the left for the full height, On call and Expiring soon
          sit beside it on the top row, the Planner and Recent activity on the bottom row. */}
      <div className="grid gap-3 lg:grid-cols-12">
        {/* THE PQS REPORT, not Inspection Readiness (Phil, 2026-07-29). Both figures are read
            from the SAME functions the real PQS report uses, so the two can never quote
            different numbers. The on time completion measures are deliberately not recomputed
            here: that logic lives in the report builder, and a second copy of it is exactly how
            the Evidence page and the Evidence PDF came to disagree. */}
        {/* THE PQS REPORT. Every measure Cardiff scores, from the SAME computation the report
            renders (lib/export/on-time getPqsMeasures), so the dashboard and the report can never
            disagree. Each white tile opens the report at ITS OWN scope. */}
        {/* NOT a whole card link any more (Phil, 2026-07-30): each white tile is its own link to
            that branch's PQS report, and an anchor inside an anchor is invalid HTML that the
            browser silently unnests. */}
        {pqs && pqs.length > 0 ? (
          <Panel title="PQS report" className="lg:col-span-5 lg:row-span-2">
            {/* Two by two (Phil, 2026-07-29). The white tiles ARE the report now: the bar list
                that used to sit under them said the same thing twice, so it is gone. More than
                four scopes and the grid scrolls rather than shrinking the tiles. */}
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  {pqsScopes.map((sc, i) => (
                    <ScoreTile
                      key={sc.key}
                      name={sc.name}
                      measures={sc.measures}
                      /* An ODD number of scopes fills the row rather than leaving a hole. An
                         Admin gets the company and every branch, so it is usually even and lays
                         out two by two; a Manager of two branches gets three, and the third used
                         to sit beside an empty cell. */
                      className={
                        pqsScopes.length % 2 === 1 && i === pqsScopes.length - 1
                          ? "col-span-2"
                          : ""
                      }
                      /* A link only where it will actually open: the report viewer admits
                         MANAGER_PLUS_ROLES, so a Supervisor following one would be bounced
                         straight back here. The company tile opens the SAME report across all
                         branches, which is what its figures are. */
                      href={
                        canOpenReports
                          ? `/reports/view/on-time?branch=${sc.branchId ?? "all"}`
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
              {/* The ACTUAL days, not "the last six months". The window rolls: it is recomputed
                  on every load from the same defaultOnTimeWindow the report and the PDF use, so
                  the three always name the same period. Deliberately not the user's to change,
                  because it is the window Cardiff scores. */}
              <p className="mt-3 shrink-0 border-t border-white/10 pt-2.5 text-[11px] text-white/50">
                Completion rate {fmtWindowDate(pqsWindow.from)} to {fmtWindowDate(pqsWindow.to)}.
                {/* Only promises what is actually on the screen: a role the report viewer will
                    not admit has nothing to open. */}
                {canOpenReports ? " Open a tile for its full report." : null}
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

{/* THREE windows in place of the Due in 14 days tile and its by check panel (Phil,
            2026-07-30), which were two boxes answering the same question. NESTED: the 30 day
            figure includes the 14, and the 14 includes the 7, which is what "due in 30 days"
            means to a manager. The captions say so rather than leaving it to be worked out. */}
        {/* A sub grid of THREE equal columns inside the seven this row has spare. Twelve columns
            will not divide into three equal spans (2, 2, 3 was the closest), and widening the row
            would mean moving the PQS report. This gives three identical tiles and touches nothing
            else. */}
        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7">
          <Tile
            href="/people"
            label="Due in 7 days"
            value={dueSoon.d7}
            tone={dueSoon.d7 > 0 ? "amber" : "green"}
            icon="calendar"
            iconTone="orange"
            sub="checks falling due"
          />
          <Tile
            href="/people"
            label="Due in 14 days"
            value={dueSoon.d14}
            icon="calendar"
            iconTone="orange"
            sub="includes the next 7 days"
          />
          <Tile
            href="/people"
            label="Due in 30 days"
            value={dueSoon.d30}
            icon="calendar"
            iconTone="orange"
            sub="includes the next 14 days"
          />
        </div>

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
            <div className="flex h-full flex-col">
              {/* THE COLUMNS FILL THE PANEL. They were capped at 88px, and the panel is as tall
                  as Recent activity beside it, so a fifth of it held the week and the rest was
                  nothing. Each column now takes the height it is given and scrolls only when it
                  genuinely runs out. */}
              <div className="grid min-h-0 flex-1 grid-cols-5 divide-x divide-white/10">
                {plannerWeek.map((d) => {
                  const { day, date } = fmtDay(d.iso);
                  const isToday = day === "Today";
                  return (
                    <div key={d.iso} className="flex min-w-0 flex-col px-2 first:pl-0 last:pr-0">
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
                      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
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
                              {/* GOLD IS FOR A TIME, NOT FOR THE ABSENCE OF ONE. Every booking
                                  used to print this line in the gold accent, so an untimed
                                  booking read "No time" in amber directly beside grey "Clear"
                                  days — which looks like a warning about something that is
                                  merely unset. An untimed booking is now muted, like "Clear",
                                  and says "No time set" so it reads as information. */}
                              <span
                                className={`block truncate text-[10px] tabular-nums ${
                                  it.time ? "text-gold-300/85" : "text-white/40"
                                }`}
                              >
                                {it.dayHint ? `${it.dayHint} ` : ""}
                                {it.time ?? "No time set"}
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
              <p className="mt-2 shrink-0 border-t border-white/10 pt-2 text-[10px] text-white/45">
                {/* An empty week said "Clear" five times and left the rest of the panel blank.
                    Say it once, in the space that was doing nothing. */}
                {plannerWeek.every((d) => d.items.length === 0)
                  ? "Nothing booked this week. Weekend bookings show on the next working day."
                  : "Your booked tasks. Weekend bookings show on the next working day."}
              </p>
            </div>
          )}
        </Panel>
        <Panel title="Recent activity" href="/reports" linkLabel="View all" className="lg:col-span-3">
          {activity.length === 0 ? (
            <p className="text-sm text-white/55">Nothing has happened yet today.</p>
          ) : (
            /* TEN lines, smaller and tighter (Phil, 2026-07-30), filling the space that was
               sitting empty under six. No scroll: the panel shows what it shows and the corner
               link goes to the rest. */
            <ul className="space-y-1">
              {activity.map((a, i) => (
                <li
                  key={`${a.when}-${i}`}
                  className="flex items-start justify-between gap-2 border-b border-white/5 pb-1 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 text-[11px] leading-snug text-white/80">{a.summary}</span>
                  <span className="shrink-0 text-[10px] leading-snug text-white/45">
                    {fmtWhen(a.when)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
