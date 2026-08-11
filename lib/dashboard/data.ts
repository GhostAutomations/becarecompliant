import "server-only";

/**
 * Be Care Compliant — Dashboard summary data.
 *
 * All reads go through the RLS-scoped user client, so every figure already
 * respects the caller's role and branch scope (a Branch Manager sees their
 * branch, an Admin/Registered role sees the whole company). Leavers, archived
 * people and cancelled/discharged service users are excluded because the
 * rollup views used to define the "active" set already exclude them.
 */

import { createClient } from "@/lib/supabase/server";
import {
  listAbsenceRegister,
  listOpenBookings,
  listActivePeople,
} from "@/lib/absence/data";
import { listMyBookings } from "@/lib/planner/data";
import { listOutstandingRtw } from "@/lib/absence/rtw";

/** Today in Europe/London as an ISO yyyy-mm-dd string (dates compare lexically). */
function londonTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DueBuckets = { overdue: number; due14: number; due30: number };

/**
 * Bucket active records by their MOST URGENT check's due date, into fixed 14 and
 * 30 day windows (independent of the amber setting). Nested: due30 includes
 * due14. A record with an overdue check counts as overdue only.
 */
async function bucketPopulation(
  statusView: "person_check_status" | "service_user_check_status",
  rollupView: "person_rollup" | "service_user_rollup",
  idCol: "person_id" | "service_user_id",
  companyId: string,
): Promise<DueBuckets> {
  const supabase = await createClient();
  const [{ data: active }, { data: checks }] = await Promise.all([
    supabase.from(rollupView).select(idCol).eq("company_id", companyId),
    supabase.from(statusView).select(`${idCol}, due_date, rag`).eq("company_id", companyId),
  ]);

  const activeSet = new Set<string>(
    ((active as Array<Record<string, string>> | null) ?? []).map((r) => r[idCol]),
  );

  const today = londonTodayIso();
  const in14 = addDaysIso(today, 14);
  const in30 = addDaysIso(today, 30);

  // Aggregate per active record: is it overdue (any red check), and the soonest
  // FUTURE due date. Overdue is authoritative from the view's rag, NOT from a raw
  // date compare (a completed one-off check keeps a historical due_date but is
  // green, so it must not read as overdue).
  const agg = new Map<string, { red: boolean; minFuture: string | null }>();
  for (const c of (checks as Array<Record<string, string | null>> | null) ?? []) {
    const id = c[idCol] as string | null;
    if (!id || !activeSet.has(id)) continue;
    let a = agg.get(id);
    if (!a) {
      a = { red: false, minFuture: null };
      agg.set(id, a);
    }
    if (c.rag === "red") a.red = true;
    const due = c.due_date as string | null;
    if (due && due >= today && (!a.minFuture || due < a.minFuture)) a.minFuture = due;
  }

  const buckets: DueBuckets = { overdue: 0, due14: 0, due30: 0 };
  for (const a of agg.values()) {
    if (a.red) {
      buckets.overdue += 1;
      continue;
    }
    if (!a.minFuture) continue;
    if (a.minFuture <= in14) {
      buckets.due14 += 1;
      buckets.due30 += 1;
    } else if (a.minFuture <= in30) {
      buckets.due30 += 1;
    }
  }
  return buckets;
}

export async function getComplianceBuckets(
  companyId: string,
): Promise<{ people: DueBuckets; serviceUsers: DueBuckets }> {
  const [people, serviceUsers] = await Promise.all([
    bucketPopulation("person_check_status", "person_rollup", "person_id", companyId),
    bucketPopulation(
      "service_user_check_status",
      "service_user_rollup",
      "service_user_id",
      companyId,
    ),
  ]);
  return { people, serviceUsers };
}

/** Count of pending holiday requests the caller may see (RLS-scoped). */
export async function getHolidayPendingCount(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("holiday_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");
  return count ?? 0;
}

export type AbsenceMeetingLine = { name: string; stage: string };
export type AbsenceMeetingSoon = AbsenceMeetingLine & { date: string };

/**
 * Absence meetings needing attention:
 *  - toBook: people whose derived stage is past their last recorded meeting AND
 *    who have no scheduled (unrecorded) meeting yet.
 *  - next7: scheduled, not-yet-held meetings within the next 7 days.
 */
export async function getAbsenceMeetingSummary(
  companyId: string,
): Promise<{ toBook: AbsenceMeetingLine[]; next7: AbsenceMeetingSoon[] }> {
  const [{ rows }, openBookings, people] = await Promise.all([
    listAbsenceRegister(companyId, null),
    listOpenBookings(companyId),
    listActivePeople(companyId),
  ]);

  const nameById = new Map<string, string>();
  for (const p of people) nameById.set(p.id, p.full_name);
  for (const r of rows) nameById.set(r.personId, r.fullName);

  const stageLabel = (stage: number | null, label: string | null) =>
    label ?? (stage ? `Stage ${stage}` : "Meeting");

  const bookedPersonIds = new Set(openBookings.map((b) => b.person_id));
  const toBook: AbsenceMeetingLine[] = rows
    .filter((r) => r.status.meetingDue && !bookedPersonIds.has(r.personId))
    .map((r) => ({
      name: r.fullName,
      stage: stageLabel(r.status.derivedStage, r.status.derivedLabel),
    }));

  const today = londonTodayIso();
  const in7 = addDaysIso(today, 7);
  const next7: AbsenceMeetingSoon[] = openBookings
    .filter((b) => b.meeting_date && b.meeting_date >= today && b.meeting_date <= in7)
    .map((b) => ({
      name: nameById.get(b.person_id) ?? "A team member",
      stage: b.stage ? `Stage ${b.stage}` : "Meeting",
      date: b.meeting_date as string,
    }));

  return { toBook, next7 };
}


/* ===========================================================================
 * THE COMPLIANCE SCORE
 *
 * Phil, 2026-07-29: the score on the new dashboard is Inspection Readiness wearing a better
 * face, NOT a second number. That decision matters. Two company wide percentages that can
 * disagree with each other is how a compliance product loses the argument with a regulator,
 * and a score nobody can trace back to a check is a claim rather than evidence. So this reads
 * the readiness engine, and "View score breakdown" goes to the readiness report where every
 * point of it is attributed to real checks.
 *
 * It is gated on companies.framework_enabled, the same flag the readiness page enforces, so a
 * company without it gets no dial and the dashboard shows its compliance summary instead.
 * Never show a company a score the rest of the product will not explain to them.
 *
 * The trend is real. framework_readiness_snapshots (migration 0111) stores a score per
 * requirement per day, so yesterday genuinely exists and the movement is measured rather than
 * decorated.
 * =========================================================================== */

import {
  getFrameworkReadiness,
  overallScore,
  type RequirementReadiness,
} from "@/lib/framework/data";
import { getTrainingMatrix } from "@/lib/training/data";
import {
  summarisePolicyCoverage,
  type PolicyCoverage as PolicyCoverageResult,
} from "@/lib/assignments/policy-coverage";

export type ComplianceScore =
  | { enabled: false }
  | {
      enabled: true;
      score: number | null;
      /** Whole points of movement since the comparison date, or null when it cannot be trusted. */
      delta: number | null;
      /** The date the delta is measured FROM. Never assume it was yesterday: see below. */
      deltaFrom: string | null;
      label: string;
      /** What the number is measured over, so the tile can say so instead of implying it covers
       *  everything. `unscheduled` is checks with no due date, which are NOT scored. */
      coverage: { scored: number; unscheduled: number };
      requirements: RequirementReadiness[];
    };

/**
 * Yesterday's score, with the date it was actually captured.
 *
 * Deliberately NOT lib/framework/data's getReadinessTrend, which returns scores without their
 * dates. Snapshots are only written when somebody OPENS the readiness page, so in a company
 * where that happens monthly the most recent one can be weeks old, and different requirements
 * can come from different days. Printing "since yesterday" over that would be a lie told in
 * small text. This returns the dates so the caller can refuse to draw a delta it cannot stand
 * behind, and can name the real date when it can.
 */
async function previousScores(
  companyId: string,
): Promise<Map<string, { score: number; capturedOn: string }>> {
  const supabase = await createClient();
  const today = londonTodayIso();
  const { data } = await supabase
    .from("framework_readiness_snapshots")
    .select("requirement_code, score, captured_on")
    .eq("company_id", companyId)
    .lt("captured_on", today)
    .order("captured_on", { ascending: false });
  const prev = new Map<string, { score: number; capturedOn: string }>();
  for (const r of (data as Array<{ requirement_code: string; score: number | null; captured_on: string }> | null) ?? []) {
    if (r.score == null) continue;
    if (!prev.has(r.requirement_code)) {
      prev.set(r.requirement_code, { score: r.score, capturedOn: r.captured_on });
    }
  }
  return prev;
}

/** Wording for a score. Deliberately NOT a prediction of an inspection outcome. */
/**
 * The label under the score.
 *
 * Deliberately NOT a claim about being inspection ready (Phil, 2026-07-30). This number is an
 * average of the requirements that have evidence mapped to them; it is a good early warning and
 * it is not a verdict an inspector has given. "On top of it" is a description of the work, which
 * is what the number actually measures.
 */
export function scoreLabel(score: number | null): string {
  if (score == null) return "Not scored yet";
  if (score >= 90) return "On top of it";
  if (score >= 75) return "Mostly on track";
  if (score >= 50) return "Needs attention";
  return "At risk";
}

export async function getComplianceScore(
  companyId: string,
  opts: { companyWide: boolean },
): Promise<ComplianceScore> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("framework_enabled, regulator")
    .eq("id", companyId)
    .maybeSingle();
  const co = company as { framework_enabled: boolean | null; regulator: string | null } | null;
  if (!co?.framework_enabled) return { enabled: false };

  // ?? "ciw", matching the readiness page, the snapshot writer and the readiness PDF. The
  // column is nullable and nothing in the app ever writes it, so defaulting the other way
  // would score the dashboard against a DIFFERENT framework from the report the score links
  // to, and would never match a snapshot code, silently killing the delta for ever.
  const regulator = (co.regulator ?? "ciw") as "cqc" | "ciw";
  const [readiness, prev] = await Promise.all([
    getFrameworkReadiness(companyId, regulator),
    previousScores(companyId),
  ]);

  const score = overallScore(readiness.requirements);
  const scored = readiness.requirements.filter((r) => r.score != null);

  /**
   * When a delta is allowed to appear at all. Every one of these is a way it could otherwise
   * be wrong, and a wrong number under a compliance score is worse than no number.
   *
   *  1. Company wide callers only. Readiness is computed through RLS, so a Branch Manager's
   *     live score covers their branch while the stored snapshot was written by whoever last
   *     opened the readiness page, possibly company wide. Subtracting one from the other
   *     invents movement that never happened.
   *  2. Every requirement scored today must have a previous score, or the two averages are
   *     taken over different sets.
   *  3. Every previous score must come from the SAME day, because snapshots are written on
   *     page load and different requirements can otherwise be weeks apart.
   *  4. That day must be within the last week, or "since" is measuring something nobody
   *     remembers doing.
   */
  const days = [...new Set(scored.map((r) => prev.get(r.code)?.capturedOn ?? ""))];
  const havePrev = scored.length > 0 && scored.every((r) => prev.has(r.code));
  const oneDay = days.length === 1 && days[0] !== "";
  const recent = oneDay && days[0] >= addDaysIso(londonTodayIso(), -7);
  const usable = opts.companyWide && havePrev && oneDay && recent;

  const prevOverall = usable
    ? Math.floor(scored.reduce((sum, r) => sum + (prev.get(r.code)?.score ?? 0), 0) / scored.length)
    : null;

  return {
    enabled: true,
    score,
    delta: score != null && prevOverall != null ? score - prevOverall : null,
    deltaFrom: usable ? days[0] : null,
    label: scoreLabel(score),
    coverage: {
      scored: readiness.requirements.reduce((n, r) => n + r.checks.total, 0),
      unscheduled: readiness.requirements.reduce((n, r) => n + r.checks.unscheduled, 0),
    },
    requirements: readiness.requirements,
  };
}

/**
 * Mandatory training completion, the figure the training matrix already computes as green or
 * amber over every mandatory cell. Reusing it rather than counting again keeps the dashboard
 * and the Training screen from ever disagreeing, which is the mistake the Evidence page and
 * the Evidence PDF made.
 */
export async function getTrainingCompletion(companyId: string): Promise<number | null> {
  const matrix = await getTrainingMatrix(companyId, null);
  return matrix.summary.mandatoryCompliancePct;
}


/* ===========================================================================
 * The rest of the Mission Control tiles.
 *
 * Phil, 2026-07-29: build every tile in the mockup, plumb in the ones that have real data,
 * and make the ones that do not RED so the gap is visible rather than quietly missing. These
 * are the plumbed ones. The red ones need features that do not exist yet: scheduled
 * inspections, an incidents department, a risk model, policy signing coverage, and the AI
 * insight run.
 * =========================================================================== */

type StatusRow = { check_name: string | null; due_date: string | null; rag: string | null };

async function bothRegisters(companyId: string): Promise<StatusRow[]> {
  const supabase = await createClient();
  const [people, su] = await Promise.all([
    supabase
      .from("person_check_status")
      .select("check_name, due_date, rag")
      .eq("company_id", companyId),
    supabase
      .from("service_user_check_status")
      .select("check_name, due_date, rag")
      .eq("company_id", companyId),
  ]);
  return [
    ...(((people.data as StatusRow[] | null) ?? [])),
    ...(((su.data as StatusRow[] | null) ?? [])),
  ];
}

/**
 * Absence work waiting on somebody, for the dashboard tile.
 *
 * TWO different things, deliberately added together in the tile's headline figure because they
 * are one job to a manager: people whose absence has tripped a trigger and still need a meeting
 * invite sending, and Return to Works that have not been completed.
 *
 * `invites` deliberately excludes anybody who already has a meeting booked. An invite that has
 * gone out is not outstanding work, even though the meeting has not happened yet.
 */
export type AbsenceActions = {
  invites: number;
  rtw: number;
  /** Return to Works already past their due date. These are what make the tile red. */
  rtwOverdue: number;
};

export async function getAbsenceActions(companyId: string): Promise<AbsenceActions> {
  const [{ rows }, openBookings, rtw] = await Promise.all([
    listAbsenceRegister(companyId, null),
    listOpenBookings(companyId),
    listOutstandingRtw(companyId),
  ]);
  const booked = new Set(openBookings.map((b) => b.person_id));
  return {
    invites: rows.filter((r) => r.status.meetingDue && !booked.has(r.personId)).length,
    rtw: rtw.length,
    rtwOverdue: rtw.filter((r) => r.overdue).length,
  };
}

/**
 * Holiday requests waiting on a decision.
 *
 * A head count, not the rows: RLS already scopes this to what the caller may approve, so a
 * Branch Manager sees their own branch's queue and nobody else's.
 */
export async function getPendingHolidayApprovals(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("holiday_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");
  return count ?? 0;
}

/**
 * SMS and AI spend for the CURRENT calendar month, London.
 *
 * VISIBILITY. `usage_events` and `ai_credit_ledger` are Admin only by RLS, so the dashboard only
 * asks for this as a Company Admin: a Manager would read an empty set, and an empty set drawn as
 * "0 sent" is a wrong number rather than an absent one. `company_ai_credits` is different again,
 * readable by any company MEMBER, which means a founder in a manage as session cannot read it at
 * all (they are not a member of the company they are acting for). That is why `remaining` is
 * nullable and renders as n/a rather than a red zero.
 *
 * BOTH now have an allowance: a monthly grant by tier plus top ups. SMS got one on 2026-07-31,
 * so the tile counts down instead of only counting up.
 *
 * Returns null if any read FAILS, so the tiles disappear instead of reporting a transient error
 * as zero spend.
 */
export type SpendThisMonth = {
  /** `remaining` is null when the balance cannot be read, never 0 as a stand in. */
  sms: { sent: number; segments: number; remaining: number | null; monthlyGrant: number | null };
  ai: { used: number; remaining: number | null; monthlyGrant: number | null };
};

/**
 * Midnight in London on the first of this month, as a UTC instant.
 *
 * NOT `${month}-01T00:00:00Z`: in British Summer Time that is 01:00 London, so the first hour of
 * the month would be excluded and the dashboard would disagree with the usage_monthly view, which
 * buckets at `occurred_at at time zone 'Europe/London'`.
 */
function londonMonthStartUtcIso(): string {
  const monthStart = `${londonTodayIso().slice(0, 7)}-01`;
  const guess = new Date(`${monthStart}T00:00:00Z`);
  const offsetLabel =
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "longOffset" })
      .formatToParts(guess)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetLabel);
  const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - minutes * 60_000).toISOString();
}

export async function getSpendThisMonth(companyId: string): Promise<SpendThisMonth | null> {
  const supabase = await createClient();
  const monthStart = londonMonthStartUtcIso();
  const month = `${londonTodayIso().slice(0, 7)}-01`;

  const [usageRes, ledgerRes, balanceRes, companyRes, smsBalanceRes] = await Promise.all([
    // The VIEW, not the raw table: it buckets the month in London, so this figure and the one on
    // the Usage page are the same figure.
    supabase
      .from("usage_monthly")
      .select("event_count, units_sum")
      .eq("company_id", companyId)
      .eq("kind", "sms")
      .eq("month", month)
      .maybeSingle(),
    // Spends net of refunds. A refunded credit was never used: runAi hands it back when the
    // request fails, and counting it would overstate what the company got for its money.
    supabase
      .from("ai_credit_ledger")
      .select("delta")
      .eq("company_id", companyId)
      .in("reason", ["spend", "refund"])
      .gte("created_at", monthStart),
    supabase.from("company_ai_credits").select("balance").eq("company_id", companyId).maybeSingle(),
    supabase.from("companies").select("tier").eq("id", companyId).maybeSingle(),
    supabase.from("company_sms_credits").select("balance").eq("company_id", companyId).maybeSingle(),
  ]);

  // A failed read is not zero spend. Hide the tiles rather than publish a wrong number.
  if (usageRes.error || ledgerRes.error) return null;

  const usage = usageRes.data as { event_count: number; units_sum: number } | null;
  const ledger = ((ledgerRes.data as Array<{ delta: number }> | null) ?? []);

  // The tier's monthly allowance, read from the SAME function that grants it, so the tile's
  // "running low" cannot drift from what a company actually gets.
  let monthlyGrant: number | null = null;
  let smsMonthlyGrant: number | null = null;
  const tier = (companyRes.data as { tier: string } | null)?.tier ?? null;
  if (tier) {
    const [{ data: grant }, { data: smsGrant }] = await Promise.all([
      supabase.rpc("tier_monthly_ai_credits", { t: tier }),
      supabase.rpc("tier_monthly_sms_credits", { t: tier }),
    ]);
    monthlyGrant = typeof grant === "number" ? grant : null;
    smsMonthlyGrant = typeof smsGrant === "number" ? smsGrant : null;
  }

  return {
    sms: {
      sent: Number(usage?.event_count ?? 0),
      segments: Number(usage?.units_sum ?? 0),
      remaining: smsBalanceRes.error
        ? null
        : ((smsBalanceRes.data as { balance: number } | null)?.balance ?? null),
      monthlyGrant: smsMonthlyGrant,
    },
    ai: {
      used: Math.max(0, -ledger.reduce((n, r) => n + Number(r.delta ?? 0), 0)),
      remaining: balanceRes.error
        ? null
        : ((balanceRes.data as { balance: number } | null)?.balance ?? null),
      monthlyGrant,
    },
  };
}

export type DueSoon = { d7: number; d14: number; d30: number };

/**
 * Checks falling due in the next 7, 14 and 30 days.
 *
 * NESTED, not three separate bands: the 30 day figure includes the 14, and the 14 includes the 7.
 * That is what "due in 30 days" means to a manager, and it matches getComplianceBuckets, which
 * has nested its own windows since the start. Three exclusive bands would need three captions
 * explaining themselves.
 *
 * Overdue work is deliberately absent. That is the Open actions tile, and counting it here would
 * make the day look worse than it is.
 */
export async function getDueSoon(companyId: string): Promise<DueSoon> {
  const rows = await bothRegisters(companyId);
  const today = londonTodayIso();
  const in7 = addDaysIso(today, 7);
  const in14 = addDaysIso(today, 14);
  const in30 = addDaysIso(today, 30);

  const out: DueSoon = { d7: 0, d14: 0, d30: 0 };
  for (const r of rows) {
    if (!r.due_date || !r.check_name) continue;
    if (r.due_date < today || r.due_date > in30) continue;
    out.d30 += 1;
    if (r.due_date <= in14) out.d14 += 1;
    if (r.due_date <= in7) out.d7 += 1;
  }
  return out;
}

export type PlannerItem = {
  /** HH:MM, or null for a booking with no start time. */
  time: string | null;
  label: string;
  subject: string | null;
  /** Set only when the booking is really on a weekend and is being shown on the next working
   *  day, e.g. "Sat". Never invent a date the booking does not have. */
  dayHint: string | null;
};
export type PlannerDay = { iso: string; items: PlannerItem[] };

/** Saturday or Sunday. Bank holidays are not modelled, the same convention the Complaints
 *  response deadlines use, so the two parts of the app never disagree about a working day. */
function isWeekendIso(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function shortDayIso(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/**
 * THIS USER'S planner, as the next five WORKING day columns.
 *
 * Phil, 2026-07-29: the tile is the Planner and it shows their planner, nothing else. So it reads
 * the same bookings the Planner page reads (`listMyBookings`, the tasks this user conducts), not
 * every check falling due across the company.
 *
 * The list is always five entries long even when a day is empty, because a column that vanishes
 * when nothing is booked makes the week impossible to read at a glance. A booking that really
 * falls on a Saturday or Sunday is shown on the following working day carrying its real day as a
 * hint, so nothing is hidden and no date is misstated.
 */
export async function getPlannerWeek(userId: string): Promise<PlannerDay[]> {
  const bookings = await listMyBookings(userId);
  const today = londonTodayIso();

  const days: string[] = [];
  let cursor = today;
  while (days.length < 5) {
    if (!isWeekendIso(cursor)) days.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  const last = days[days.length - 1];

  /** The column a booking belongs in: its own day, or the next working day for a weekend. */
  function columnFor(iso: string): string | null {
    let d = iso;
    while (isWeekendIso(d)) d = addDaysIso(d, 1);
    return days.includes(d) ? d : null;
  }

  const byDay = new Map<string, PlannerItem[]>(days.map((d) => [d, [] as PlannerItem[]]));
  for (const b of bookings) {
    if (b.status !== "planned") continue;
    if (b.scheduledDate < today || b.scheduledDate > last) continue;
    const col = columnFor(b.scheduledDate);
    if (!col) continue;
    byDay.get(col)?.push({
      time: b.startTime,
      label: b.label,
      subject: b.subjectName,
      dayHint: col === b.scheduledDate ? null : shortDayIso(b.scheduledDate),
    });
  }

  return days.map((iso) => ({
    iso,
    items: (byDay.get(iso) ?? []).sort((a, b) => {
      // Timed bookings first, in time order; untimed ones after, by label.
      if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return a.label.localeCompare(b.label);
    }),
  }));
}

/**
 * Audit checks that are in date, as a percentage. The company's Audit check is a real check
 * like any other, so this counts green over everything named as an audit rather than inventing
 * a separate audit engine.
 */
export async function getAuditsCompleted(companyId: string): Promise<number | null> {
  const rows = await bothRegisters(companyId);
  const audits = rows.filter((r) => (r.check_name ?? "").toLowerCase().includes("audit"));
  if (audits.length === 0) return null;
  const green = audits.filter((r) => r.rag === "green").length;
  // Rounded DOWN, never up (Phil, 2026-07-30).
  return Math.floor((green / audits.length) * 100);
}

export type ActivityLine = { summary: string; when: string };

/** The audit log, which already records every action, newest first. */
export async function getRecentActivity(companyId: string): Promise<ActivityLine[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("summary, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    // Ten: the panel is tall enough for ten compact lines, and six left a dead band under them.
    .limit(10);
  return (((data as Array<{ summary: string; created_at: string }> | null) ?? [])).map((r) => ({
    summary: r.summary,
    when: r.created_at,
  }));
}


/* ===========================================================================
 * The PQS summary.
 *
 * Phil, 2026-07-29: the dashboard panel is the PQS report, not Inspection Readiness.
 *
 * It shows the two PQS measures that can be read WITHOUT re-running the whole report engine:
 * satisfaction (User Experience Q2) and personal outcomes (Supplier Performance Q2). Both are
 * read from the SAME functions the real report uses, so the dashboard and the report can never
 * quote different numbers. The on time completion measures are deliberately NOT recomputed
 * here: that logic lives inside buildOnTimeReport, and a second copy of it on the dashboard is
 * exactly how the Evidence page and the Evidence PDF came to disagree. The panel links to the
 * full report for those.
 * =========================================================================== */

import { getPqsMeasures, defaultOnTimeWindow, type PqsMeasure } from "@/lib/export/on-time";

/**
 * Every measure Cardiff scores, from the SAME computation the PQS report renders. Not a
 * cheaper approximation: an earlier version showed two figures it could reach without the
 * engine, which is how a dashboard and a report end up quoting different numbers.
 *
 * COST: this runs the on time engine on dashboard load. It is the honest version and it is
 * slow. The follow up is a cached daily figure, the same fix the training percentage needs.
 */
/** `branchId` is null for the company wide scope, which opens the PQS report across all
 *  branches. */
export type PqsScope = { key: string; name: string; branchId: string | null; measures: PqsMeasure[] };

/**
 * The PQS measures for the company AND for each branch, as the white score tiles.
 *
 * Phil, 2026-07-29:
 *   one branch      one tile, carrying the BRANCH name. The branch figures and the company
 *                   figures are the same numbers, and two tiles saying the same thing is noise.
 *   two branches    three tiles: Company, then one per branch. Same shape upwards.
 *   more than four  the strip scrolls.
 *
 * COST. Each branch scope is a full run of the PQS engine, so they run in parallel and the
 * company measures are passed in rather than computed twice: the panel below has already worked
 * them out.
 */
export async function getPqsScopes(
  companyId: string,
  companyName: string,
  companyMeasures: PqsMeasure[],
  branches: { id: string; name: string }[],
): Promise<PqsScope[]> {
  if (branches.length === 0) {
    return [{ key: "company", name: companyName, branchId: null, measures: companyMeasures }];
  }
  const win = defaultOnTimeWindow();
  if (branches.length === 1) {
    /*
     * BRANCH scoped, not the company figures reused under a branch name.
     *
     * They are usually identical and they are not always: a service user can have no branch at
     * all (the column is nullable), and people can sit on a branch row that is not an active
     * `kind = 'branch'`, which listAccessibleBranchTypes excludes. Since this tile now OPENS that
     * branch's report, reusing the company numbers is exactly how a tile and the report it opens
     * end up quoting different figures.
     */
    const b = branches[0];
    return [
      {
        key: b.id,
        name: b.name,
        branchId: b.id,
        measures: await getPqsMeasures({
          companyId,
          companyName,
          branchId: b.id,
          branchName: b.name,
          window: win,
        }),
      },
    ];
  }
  const perBranch = await Promise.all(
    branches.map((b) =>
      getPqsMeasures({
        companyId,
        companyName,
        branchId: b.id,
        branchName: b.name,
        window: win,
      }),
    ),
  );
  return [
    { key: "company", name: "Company", branchId: null, measures: companyMeasures },
    ...branches.map((b, i) => ({ key: b.id, name: b.name, branchId: b.id, measures: perBranch[i] })),
  ];
}

export async function getPqsSummary(
  companyId: string,
  companyName: string,
): Promise<PqsMeasure[]> {
  return getPqsMeasures({
    companyId,
    companyName,
    branchId: null,
    branchName: null,
    window: defaultOnTimeWindow(),
  });
}

/* ===========================================================================
 * POLICY COVERAGE (THE LIST item 20).
 *
 * "Policies up to date" was in the dashboard mockup, was never built, and had dropped off the
 * screen altogether. The gap it catches is real: a policy moves to version 2 and the people
 * who signed version 1 still show as completed everywhere else in the product.
 *
 * WHAT THE NUMBER MEANS (agreed with Phil, 2026-08-11): signed at the CURRENT version, out of
 * what has actually been sent out. Not everybody gets every policy: this product lets a policy
 * go to the people it applies to, so measuring against the whole register would report a false
 * disaster for a company doing exactly what the product intends.
 *
 * The COUNTING RULE lives in lib/assignments/policy-coverage.ts, pure and unit tested, because
 * the first version of it was wrong in a way that read perfectly plausibly. This function only
 * fetches. Leavers and archived people are excluded here: a leaver cannot be chased and should
 * not drag a live figure down.
 * =========================================================================== */

export type { PolicyCoverage, PolicyBehind } from "@/lib/assignments/policy-coverage";

export async function getPolicyCoverage(companyId: string): Promise<PolicyCoverageResult> {
  const supabase = await createClient();

  const [{ data: policies }, { data: rows }] = await Promise.all([
    supabase
      .from("company_policies")
      .select("id, title, version")
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("assignments")
      .select("person_id, policy_id, policy_version, status, people(full_name, employment_status, archived_at)")
      .eq("company_id", companyId)
      .eq("kind", "policy"),
  ]);

  type Row = {
    person_id: string;
    policy_id: string | null;
    policy_version: number | null;
    status: string;
    people: { full_name: string; employment_status: string; archived_at: string | null } | null;
  };

  const assignments = ((rows as unknown as Row[] | null) ?? [])
    .filter((r) => r.policy_id && r.people && !r.people.archived_at && r.people.employment_status !== "leaver")
    .map((r) => ({
      personId: r.person_id,
      personName: r.people!.full_name,
      policyId: r.policy_id as string,
      status: r.status,
      policyVersion: r.policy_version,
    }));

  return summarisePolicyCoverage(
    assignments,
    ((policies as { id: string; title: string; version: number }[] | null) ?? []),
  );
}
