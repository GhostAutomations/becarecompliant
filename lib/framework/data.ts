import "server-only";
import { createClient } from "@/lib/supabase/server";
import { missingDocuments, type DocTracker } from "@/lib/people/doc-gaps";
import { getOutcomesRegister } from "@/lib/service-users/data";
import { getSatisfaction } from "@/lib/service-users/satisfaction";
import { getTrainingMatrix } from "@/lib/training/data";
import { getOnTimeCountsByCheckId } from "@/lib/export/on-time";
import { themeStatus, themeReason } from "@/lib/framework/theme-status";
import { type WaitingCounts, waitingTotal } from "@/lib/framework/waiting";
import {
  complaintHandling,
  incidentHandling,
  handlingPct,
  type ComplaintRow,
  type IncidentRow,
} from "@/lib/framework/case-handling";
import { reportableCheck } from "@/lib/notifications/reportable";
import { amberWindow, isDueSoon } from "@/lib/framework/due-soon";
import { cache } from "react";
import { assessGap, gapInHand, isLateReason, isSafetyCheck, type GapAction, type GapRisk, type GapUpdate } from "@/lib/framework/gaps";
import { scwCountsAsRegistered } from "@/lib/people/scw";

/**
 * Inspection readiness against a regulator's framework. Each requirement (CIW
 * theme or CQC key question) rolls up the RAG of the checks mapped to it, plus
 * any outcomes / satisfaction metrics mapped to it. Everything reads through the
 * caller's RLS, so it is automatically scoped to their role and branch.
 */

/** Supabase types a to-one embedded relation as an array; normalise to one row. */
function relOne<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export type Rag = "red" | "amber" | "green" | "none";

export type ReadinessMetric = { label: string; pct: number | null; note?: string };

export type RequirementReadiness = {
  code: string;
  keyArea: string;
  title: string;
  description: string;
  status: Rag;
  score: number | null; // 0-100 readiness score, or null when nothing is mapped
  checks: {
    overdue: number;
    dueSoon: number;
    onTrack: number;
    /** Instances that HAVE a due date. The score is measured over these. */
    total: number;
    /** Instances with NO due date. They cannot be overdue, so leaving them silently out of the
     *  total could only ever flatter the score. Counted, and shown to the reader. */
    unscheduled: number;
    /** Instances with no due date YET because they wait on an earlier check (0321): an
     *  appraisal waiting for Supervision 3, a supervision waiting for an appraisal or for
     *  probation to be signed off. Not gaps, and not in the score either. */
    waiting: WaitingCounts;
  };
  metrics: ReadinessMetric[];
  /** On time over the last six months, every item that fell due counted once. Null when none did. */
  onTimePct: number | null;
  /** The regulator's own open notices against this theme (inspection_notices, 0306). */
  notices: { priority: number; improvement: number };
  /** The single most important reason for the status, for a one line tile. */
  reason: string;
  /** Something feeds this theme: a mapped check, a metric or a notice. */
  mapped: boolean;
};

export type FrameworkItem = {
  /** Null for a DBS renewal or Right to Work, which are dates on the person, not checks. */
  instanceId: string | null;
  recordId: string;
  recordName: string;
  checkName: string;
  dueDate: string;
  /** When the check was last done (null for a DBS renewal or Right to Work, or never done). Linked
   *  Updates written since then count as the action (snag S17). */
  lastCompleted: string | null;
  population: "people" | "service_users";
  /** Where the row goes: the check's Complete page, or the person for a DBS or Right to Work. */
  href: string;
  /** The value an Update uses to be ABOUT this gap (lib/updates/about.ts). */
  aboutValue: string;
  /** The earliest Planner booking still to happen, or null (snag S1). Always null for a DBS renewal
   *  or Right to Work, which cannot be booked. */
  planned: string | null;
  /** Overdue only (0374): what CIW would likely make of it, and the action in place if any. */
  safety: boolean;
  action: GapAction;
  risk: GapRisk | null;
};

export type FrameworkReadiness = {
  regulator: "cqc" | "ciw";
  requirements: RequirementReadiness[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RANK: Record<Rag, number> = { none: 0, green: 1, amber: 2, red: 3 };
function worst(a: Rag, b: Rag): Rag {
  return RANK[a] >= RANK[b] ? a : b;
}
function pctToRag(pct: number | null): Rag {
  if (pct == null) return "none";
  if (pct >= 85) return "green";
  if (pct >= 50) return "amber";
  return "red";
}

/** Where a lapsed DBS or Right to Work counts: Leadership and Management (CIW), Safe (CQC). */
export function trackerThemeCode(regulator: "cqc" | "ciw"): string {
  return regulator === "ciw" ? "LM" : "SAFE";
}

/** Active people in this branch whose DBS renewal date or Right to Work expiry has passed (0374),
 *  or who have never had one recorded at all (audit W1, Phil 2026-10-03: red from the start date,
 *  through lib/people/doc-gaps.ts, the rule every screen uses). A missing document is dated from
 *  the start date, so it ages like any other gap and goes through the same Priority Action Notice
 *  test. Read through the caller's RLS. */
async function lapsedTrackers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  branchId: string | null,
  today: string,
): Promise<Array<{ personId: string; personName: string; tracker: "dbs_renewal" | "right_to_work"; name: string; date: string }>> {
  let pq = supabase
    .from("people")
    .select("id, full_name, start_date, branch_id")
    .eq("company_id", companyId)
    .eq("employment_status", "active")
    .is("archived_at", null);
  if (branchId) pq = pq.eq("branch_id", branchId);
  let tq = supabase
    .from("person_trackers")
    .select("person_id, dbs_date, enhanced_dbs_date, rtw_expiry_date, rtw_limits")
    .eq("company_id", companyId);
  if (branchId) tq = tq.eq("branch_id", branchId);
  const [{ data: people }, { data: trackers }] = await Promise.all([pq, tq]);
  const byPerson = new Map(
    ((trackers as Array<DocTracker & { person_id: string }> | null) ?? []).map((t) => [t.person_id, t]),
  );
  const out: Array<{ personId: string; personName: string; tracker: "dbs_renewal" | "right_to_work"; name: string; date: string }> = [];
  for (const p of (people as Array<{ id: string; full_name: string; start_date: string | null; branch_id: string | null }> | null) ?? []) {
    const t = byPerson.get(p.id) ?? null;
    for (const g of missingDocuments(t, p.start_date, today)) {
      out.push({ personId: p.id, personName: p.full_name, tracker: g.kind, name: g.name, date: g.since });
    }
    if (t?.enhanced_dbs_date && t.enhanced_dbs_date < today) {
      out.push({ personId: p.id, personName: p.full_name, tracker: "dbs_renewal", name: "DBS renewal", date: t.enhanced_dbs_date });
    }
    if (t?.rtw_expiry_date && t.rtw_expiry_date < today) {
      out.push({ personId: p.id, personName: p.full_name, tracker: "right_to_work", name: "Right to Work", date: t.rtw_expiry_date });
    }
  }
  return out;
}

export async function getFrameworkReadiness(
  companyId: string,
  regulator: "cqc" | "ciw",
  /** One registered service (0363, Phil 2026-10-01: CIW inspects and rates each service on its
   *  own, Cardiff and Gwent separately). Null is every branch together, as before. */
  branchId: string | null = null,
): Promise<FrameworkReadiness> {
  // It goes into a PostgREST filter string below, so only a real id gets that far.
  if (branchId && !UUID_RE.test(branchId)) branchId = null;
  const supabase = await createClient();

  const [reqRes, mapRes, checkRes] = await Promise.all([
    supabase
      .from("framework_requirements")
      .select("id, code, key_area, title, description, sort_order")
      .eq("regulator", regulator)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("requirement_evidence_map")
      .select("requirement_id, check_definition_id, source_kind")
      .eq("company_id", companyId),
    supabase.rpc("get_framework_check_readiness", { p_company: companyId, p_regulator: regulator, p_branch: branchId }),
  ]);
  /* A notice belongs to the service it was issued to. One recorded before 0363 has no branch and
     counts against every branch, so it is never lost. */
  let noticeQuery = supabase
    .from("inspection_notices")
    .select("requirement_code, kind")
    .eq("company_id", companyId)
    .eq("regulator", regulator)
    .is("resolved_on", null);
  if (branchId) noticeQuery = noticeQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
  const { data: noticeRows } = await noticeQuery;
  const noticesByCode = new Map<string, { priority: number; improvement: number }>();
  for (const n of (noticeRows as Array<{ requirement_code: string; kind: string }> | null) ?? []) {
    const cur = noticesByCode.get(n.requirement_code) ?? { priority: 0, improvement: 0 };
    if (n.kind === "priority_action") cur.priority += 1;
    else cur.improvement += 1;
    noticesByCode.set(n.requirement_code, cur);
  }


  type Req = { id: string; code: string; key_area: string; title: string; description: string };
  const requirements = (reqRes.data as Req[] | null) ?? [];
  const mapRows = (mapRes.data as Array<{ requirement_id: string; check_definition_id: string | null; source_kind: string | null }> | null) ?? [];
  const checkRows = (checkRes.data as Array<{
    requirement_id: string;
    overdue: number;
    due_soon: number;
    on_track: number;
    total: number;
    unscheduled: number;
    waiting_sup3: number;
    waiting_appraisal: number;
    waiting_probation: number;
  }> | null) ?? [];

  const checksByReq = new Map(checkRows.map((c) => [c.requirement_id, c]));
  const sourcesByReq = new Map<string, Set<string>>();
  // Checks by DEFINITION ID, so a requirement gets the on time rate of its OWN checks. Not by
  // key: `key` is unique per (company, population), so a people Audit and a service user Audit
  // share one.
  const checkIdsByReq = new Map<string, Set<string>>();
  for (const m of mapRows) {
    if (m.check_definition_id) {
      const set = checkIdsByReq.get(m.requirement_id) ?? new Set<string>();
      set.add(m.check_definition_id);
      checkIdsByReq.set(m.requirement_id, set);
    }
    // NOT an else: the schema allows a row to carry a check AND a metric source, and dropping the
    // metric in that case would lose it silently.
    if (!m.source_kind || m.source_kind === "check") continue;
    const set = sourcesByReq.get(m.requirement_id) ?? new Set<string>();
    set.add(m.source_kind);
    sourcesByReq.set(m.requirement_id, set);
  }

  // Only load the supplementary metrics if some requirement maps them.
  const needsOutcomes = [...sourcesByReq.values()].some((s) => s.has("outcomes"));
  const needsSatisfaction = [...sourcesByReq.values()].some((s) => s.has("satisfaction"));
  const needsTraining = [...sourcesByReq.values()].some((s) => s.has("training"));
  const needsComplaints = [...sourcesByReq.values()].some((s) => s.has("complaints"));
  const needsIncidents = [...sourcesByReq.values()].some((s) => s.has("incidents"));
  /* Complaints and incidents: their HANDLING, over the same six months the on time figure uses
     (lib/framework/case-handling.ts). Read through RLS like everything else here. */
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const [ty, tm, td] = today.split("-").map(Number);
  const sixMonthsAgo = new Date(Date.UTC(ty, tm - 7, td)).toISOString().slice(0, 10);
  const [complaintRes, incidentRes] = await Promise.all([
    needsComplaints
      ? supabase
          .from("complaints")
          .select("status, acknowledgement_due, date_acknowledged, response_due, date_closed")
          .eq("company_id", companyId)
          .match(branchId ? { branch_id: branchId } : {})
      : Promise.resolve({ data: [] as ComplaintRow[] }),
    needsIncidents
      ? supabase
          .from("incidents")
          .select(
            "status, reported_on, occurred_on, investigation_completed, no_further_action, outcome_recorded_on, closed_on, notifiable, notified_on, safeguarding, safeguarding_referred_on",
          )
          .eq("company_id", companyId)
          .match(branchId ? { branch_id: branchId } : {})
      : Promise.resolve({ data: [] as IncidentRow[] }),
  ]);
  const complaints = needsComplaints
    ? complaintHandling((complaintRes.data as ComplaintRow[] | null) ?? [], today, sixMonthsAgo)
    : null;
  const incidents = needsIncidents
    ? incidentHandling((incidentRes.data as IncidentRow[] | null) ?? [], today, sixMonthsAgo)
    : null;
  const [outcomes, satisfaction, training, onTimeById] = await Promise.all([
    needsOutcomes ? getOutcomesRegister(companyId, branchId) : Promise.resolve(null),
    needsSatisfaction ? getSatisfaction(companyId, undefined, branchId) : Promise.resolve(null),
    // Mandatory training used to be pushed in as a LABEL with a null percentage, so a company at
    // 36% compliance could not move its own score. It is a real number now.
    needsTraining ? getTrainingMatrix(companyId, branchId) : Promise.resolve(null),
    // Skipped entirely when nothing is mapped, so a company with no mapping does not pay for a
    // six month engine run to learn that.
    checkIdsByReq.size > 0
      ? getOnTimeCountsByCheckId(companyId, branchId)
      : Promise.resolve(new Map<string, { onTime: number; due: number }>()),
  ]);

  /* The gaps behind each theme (cached per request), so a theme whose overdue checks are all in hand
     reads Attention, not Action needed (0375, snag S2), and lapsed DBS and Right to Work count. */
  const gapItems = await getFrameworkItems(companyId, regulator, branchId);

  /* Social Care Wales registration, CIW only: staff 6 months or more in post with a registration
     that has not ended, as the PQS report counts it (lib/export/on-time.ts). */
  let scwPct: number | null = null;
  if (regulator === "ciw" && needsTraining) {
    let pq = supabase
      .from("people")
      .select("start_date, scw_registration_number, scw_renewal_date")
      .eq("company_id", companyId)
      .eq("employment_status", "active")
      .is("archived_at", null);
    if (branchId) pq = pq.eq("branch_id", branchId);
    const { data: staff } = await pq;
    const cutoff = new Date(Date.UTC(ty, tm - 7, td)).toISOString().slice(0, 10);
    let denom = 0;
    let num = 0;
    for (const p of (staff as Array<{ start_date: string | null; scw_registration_number: string | null; scw_renewal_date: string | null }> | null) ?? []) {
      if (!p.start_date || p.start_date > cutoff) continue;
      denom += 1;
      if (scwCountsAsRegistered(p.scw_registration_number, p.scw_renewal_date, today)) num += 1;
    }
    scwPct = denom > 0 ? Math.floor((100 * num) / denom) : null;
  }

  const out: RequirementReadiness[] = requirements.map((r) => {
    const c = checksByReq.get(r.id) ?? {
      overdue: 0,
      due_soon: 0,
      on_track: 0,
      total: 0,
      unscheduled: 0,
      waiting_sup3: 0,
      waiting_appraisal: 0,
      waiting_probation: 0,
    };
    const checks = {
      overdue: c.overdue,
      dueSoon: c.due_soon,
      onTrack: c.on_track,
      total: c.total,
      unscheduled: c.unscheduled ?? 0,
      waiting: {
        sup3: c.waiting_sup3 ?? 0,
        appraisal: c.waiting_appraisal ?? 0,
        probation: c.waiting_probation ?? 0,
      },
    };

    const metrics: ReadinessMetric[] = [];
    const sources = sourcesByReq.get(r.id) ?? new Set<string>();
    if (sources.has("outcomes") && outcomes) {
      metrics.push({ label: "Personal outcomes achieved or progressing", pct: outcomes.pqsPct });
    }
    if (sources.has("satisfaction") && satisfaction) {
      metrics.push({ label: "Customer satisfaction", pct: satisfaction.pct });
    }
    if (sources.has("training")) {
      metrics.push({
        label: "Mandatory training",
        pct: training?.summary.mandatoryCompliancePct ?? null,
        note: "Tracked in the Training department",
      });
      /* CIW's framework (Phil, 2026-10-02): safeguarding is its own line ("staff understand and
         follow the Wales Safeguarding Procedures"), and registration with Social Care Wales is
         part of Good for staff (line of enquiry 11). The same figures the PQS report uses. */
      if (training?.summary.safeguardingPct != null) {
        metrics.push({ label: "Safeguarding training", pct: training.summary.safeguardingPct });
      }
      if (regulator === "ciw" && scwPct != null) {
        metrics.push({ label: "Social Care Wales registration", pct: scwPct, note: "Staff 6 months or more in post" });
      }
    }

    /*
     * History, not just today's board.
     *
     * "Nothing is overdue right now" and "the work was done by its due date over the last six
     * months" are different questions, and a company that completes everything late clears the
     * first while failing the second. This is the SAME computation the PQS report runs, averaged
     * over the checks mapped to THIS requirement, so the two surfaces can never disagree.
     * A check with nothing due in the window contributes nothing rather than a zero.
     */
    /* Every item that fell due counts once, across all of this theme's checks (Phil,
       2026-09-19). The PQS report still shows each check on its own line. */
    let due = 0;
    let onTime = 0;
    for (const id of checkIdsByReq.get(r.id) ?? []) {
      const c = onTimeById.get(id);
      if (!c) continue;
      due += c.due;
      onTime += c.onTime;
    }
    const onTimePct = due > 0 ? Math.floor((100 * onTime) / due) : null;
    if (onTimePct != null) {
      metrics.push({
        label: "Completed by the due date, last six months",
        pct: onTimePct,
      });
    }

    const caseOverdue: Array<{ singular: string; plural: string; count: number }> = [];
    if (sources.has("complaints") && complaints) {
      metrics.push({ label: "Complaints answered on time, last six months", pct: handlingPct(complaints) });
      caseOverdue.push({ singular: "complaint", plural: "complaints", count: complaints.overdue });
    }
    if (sources.has("incidents") && incidents) {
      metrics.push({ label: "Incidents handled on time, last six months", pct: handlingPct(incidents) });
      caseOverdue.push({ singular: "incident step", plural: "incident steps", count: incidents.overdue });
    }

    /* A lapsed DBS or Right to Work is overdue like a check, and a safety gap (0374). Overdue work
       with an action in place that is not still a Priority Action Notice risk is in hand (S2). */
    const themeOverdue = gapItems.get(r.code)?.overdue ?? [];
    const trackersOverdue = themeOverdue.filter((i) => !i.instanceId).length;
    const overdueInHand = themeOverdue.filter((i) => gapInHand(i)).length;

    /* The count line, the pack and the assistant read these, so a lapsed DBS or Right to Work is
       counted with the overdue checks there too. Before, the headline said "1 check overdue" while
       the line under it said "0 overdue" (snag S14, found by the assistant in Neath, 2 Oct). */
    const counted = { ...checks, overdue: checks.overdue + trackersOverdue, total: checks.total + trackersOverdue };

    const notices = noticesByCode.get(r.code) ?? { priority: 0, improvement: 0 };
    const inputs = {
      overdue: counted.overdue,
      overdueInHand,
      dueSoon: checks.dueSoon,
      total: checks.total,
      onTimePct,
      metrics: metrics.filter((m) => m.label !== "Completed by the due date, last six months"),
      priorityOpen: notices.priority,
      improvementOpen: notices.improvement,
      caseOverdue,
    };
    const status: Rag = themeStatus(inputs);
    const reason = themeReason(inputs, regulator.toUpperCase());
    const mapped =
      checks.total > 0 || checks.unscheduled > 0 || waitingTotal(checks.waiting) > 0 || sources.size > 0 || notices.priority + notices.improvement > 0 || caseOverdue.some((c) => c.count > 0);

    // Score: % of checks not overdue, averaged with any metric percentages. Kept for the
    // snapshots and the inspection pack; the dashboard no longer shows it (see theme-status.ts).
    const signals: number[] = [];
    // Every percentage on a compliance surface is rounded DOWN, never up (Phil, 2026-07-30).
    if (counted.total > 0) signals.push(Math.floor((100 * (counted.total - counted.overdue)) / counted.total));
    for (const m of metrics) if (m.pct != null) signals.push(m.pct);
    const score = signals.length ? Math.floor(signals.reduce((a, b) => a + b, 0) / signals.length) : null;

    return {
      code: r.code,
      keyArea: r.key_area,
      title: r.title,
      description: r.description,
      status,
      score,
      checks: counted,
      metrics,
      onTimePct,
      notices,
      reason,
      mapped,
    };
  });

  return { regulator, requirements: out };
}

/**
 * THE THEMES TO SHOW (Phil, 2026-10-01: "it should show all categories", then "yes, everywhere").
 * Every theme the regulator rates, a theme nothing feeds yet showing as Not started rather than
 * vanishing. Environment is the one exception: it is for services with accommodation, and CIW never
 * rates a domiciliary service on it, so it shows only when something feeds it.
 */
export function shownThemes<T extends { mapped: boolean; code: string }>(reqs: T[]): T[] {
  return reqs.filter((r) => r.mapped || r.code !== "ENV");
}

/** Overall readiness score across the mapped requirements (0-100), or null. */
export function overallScore(reqs: RequirementReadiness[]): number | null {
  const s = reqs.map((r) => r.score).filter((x): x is number => x != null);
  return s.length ? Math.floor(s.reduce((a, b) => a + b, 0) / s.length) : null;
}

/** The exact overdue and due-soon items behind each requirement, for the
 *  drill-down. Keyed by requirement code. RLS scopes to the caller. */
/* Read once per request: Readiness, the theme status (snag S2) and the pack all need it. */
export const getFrameworkItems = cache(getFrameworkItemsUncached);

async function getFrameworkItemsUncached(
  companyId: string,
  regulator: "cqc" | "ciw",
  branchId: string | null = null,
): Promise<Map<string, { overdue: FrameworkItem[]; dueSoon: FrameworkItem[] }>> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  const { data: mapRows } = await supabase
    .from("requirement_evidence_map")
    .select("check_definition_id, framework_requirements!inner(regulator, code)")
    .eq("company_id", companyId)
    .not("check_definition_id", "is", null);

  const defToCode = new Map<string, string>();
  for (const m of (mapRows as Array<{ check_definition_id: string; framework_requirements: { regulator: string; code: string } | { regulator: string; code: string }[] }> | null) ?? []) {
    const fr = relOne(m.framework_requirements);
    if (fr && fr.regulator === regulator && m.check_definition_id) defToCode.set(m.check_definition_id, fr.code);
  }
  const defIds = [...defToCode.keys()];
  const byCode = new Map<string, { overdue: FrameworkItem[]; dueSoon: FrameworkItem[] }>();
  // No check mapped still leaves DBS and Right to Work to look at, so this does not return early.
  if (defIds.length > 0) {

  const { data: companyRow } = await supabase
    .from("companies")
    .select("amber_days_default")
    .eq("id", companyId)
    .maybeSingle();
  const companyAmber = (companyRow?.amber_days_default as number | null | undefined) ?? null;

  const { data: inst } = await supabase
    .from("check_instances")
    .select("id, definition_id, due_date, last_completed_on, record_type, person_id, service_user_id, check_definitions(name, key, recurring, amber_days), people(full_name, employment_status, archived_at, branch_id), service_users(full_name, service_status, archived_at, branch_id)")
    .eq("company_id", companyId)
    .eq("active", true)
    .not("due_date", "is", null)
    .in("definition_id", defIds)
    .order("due_date", { ascending: true });

  for (const raw of (inst as unknown[]) ?? []) {
    const r = raw as {
      id: string; definition_id: string; due_date: string; last_completed_on: string | null; record_type: string;
      person_id: string | null; service_user_id: string | null;
      check_definitions: { name: string; key: string | null; recurring: boolean; amber_days: number | null } | { name: string; key: string | null; recurring: boolean; amber_days: number | null }[] | null;
      people: { full_name: string; employment_status: string; archived_at: string | null; branch_id: string | null } | { full_name: string; employment_status: string; archived_at: string | null; branch_id: string | null }[] | null;
      service_users: { full_name: string; service_status: string; archived_at: string | null; branch_id: string | null } | { full_name: string; service_status: string; archived_at: string | null; branch_id: string | null }[] | null;
    };
    const def = relOne(r.check_definitions);
    /* DONE IS DONE (Phil, 2026-09-19): twelve completed Setup Visits were listed here as overdue.
       The same rule as the daily report and the readiness roll-up (0305). */
    if (!reportableCheck({ recurring: def?.recurring ?? true, dueDate: r.due_date, lastCompletedOn: r.last_completed_on })) continue;
    let recordName: string | null = null;
    let recordId: string | null = null;
    let population: "people" | "service_users";
    if (r.record_type === "person") {
      const p = relOne(r.people);
      if (!p || p.employment_status !== "active" || p.archived_at) continue;
      if (branchId && p.branch_id !== branchId) continue;
      recordName = p.full_name; recordId = r.person_id; population = "people";
    } else {
      const su = relOne(r.service_users);
      if (!su || su.service_status !== "active" || su.archived_at) continue;
      if (branchId && su.branch_id !== branchId) continue;
      recordName = su.full_name; recordId = r.service_user_id; population = "service_users";
    }
    if (!recordId) continue;
    const code = defToCode.get(r.definition_id);
    if (!code) continue;

    const base = population === "people" ? "people" : "service-users";
    const item: FrameworkItem = {
      instanceId: r.id,
      recordId,
      recordName: recordName!,
      checkName: def?.name ?? "check",
      dueDate: r.due_date,
      lastCompleted: r.last_completed_on,
      population,
      href: `/${base}/${recordId}/checks/${r.id}/complete`,
      aboutValue: `check:${r.id}`,
      planned: null,
      safety: isSafetyCheck(def?.key ?? null, def?.name ?? null),
      action: null,
      risk: null,
    };
    const bucket = byCode.get(code) ?? { overdue: [], dueSoon: [] };
    if (r.due_date < today) bucket.overdue.push(item);
    /* The check's own amber window, as the count above the list uses (DEF-068). It was a flat
       30 days, so Thistle's card said "11 due soon" and listed 18. */
    else if (isDueSoon(r.due_date, today, amberWindow(def?.amber_days, companyAmber))) bucket.dueSoon.push(item);
    byCode.set(code, bucket);
  }
  }

  /* DBS renewals and Right to Work (0374): dates on the person, not checks, and the two gaps CIW
     names first under staff fitness ("routine and regular checks"). A lapsed one sits with
     Leadership and Management (CQC: Safe). */
  const trackerCode = trackerThemeCode(regulator);
  for (const l of await lapsedTrackers(supabase, companyId, branchId, today)) {
    const bucket = byCode.get(trackerCode) ?? { overdue: [], dueSoon: [] };
    bucket.overdue.push({
      instanceId: null,
      recordId: l.personId,
      recordName: l.personName,
      checkName: l.name,
      dueDate: l.date,
      lastCompleted: null,
      population: "people",
      href: `/people/${l.personId}`,
      aboutValue: l.tracker,
      planned: null,
      safety: true,
      action: null,
      risk: null,
    });
    byCode.set(trackerCode, bucket);
  }

  /* WHAT CIW WOULD LIKELY MAKE OF EACH OVERDUE GAP (0374, 0375; lib/framework/gaps.ts), and WHEN EACH
     IS PLANNED (snag S1: every row, overdue and due soon, shows its Planner date). An action is a
     booking still to happen, a linked Update posted since the check was last done, with its reason,
     or holiday or absence on record covering the due date. */
  const all = [...byCode.values()].flatMap((b) => [...b.overdue, ...b.dueSoon]);
  const overdue = [...byCode.values()].flatMap((b) => b.overdue);
  if (all.length > 0) {
    const instanceIds = all.map((i) => i.instanceId).filter((x): x is string => !!x);
    const overdueIds = overdue.map((i) => i.instanceId).filter((x): x is string => !!x);
    const trackerPeople = [...new Set(overdue.filter((i) => !i.instanceId).map((i) => i.recordId))];
    const awayPeople = [...new Set(overdue.filter((i) => i.population === "people").map((i) => i.recordId))];
    const [bookingRes, taskRes, updateRes, trackerUpdateRes, holidayRes, absenceRes] = await Promise.all([
      instanceIds.length
        ? supabase.from("planner_bookings").select("check_instance_id, scheduled_date").eq("company_id", companyId).eq("status", "planned").gte("scheduled_date", today).in("check_instance_id", instanceIds)
        : Promise.resolve({ data: [] }),
      instanceIds.length
        ? supabase.from("planner_booking_tasks").select("check_instance_id, status, planner_bookings!inner(scheduled_date, status)").eq("company_id", companyId).in("check_instance_id", instanceIds)
        : Promise.resolve({ data: [] }),
      overdueIds.length
        ? supabase.from("record_updates").select("about_check_instance, created_at, author_name, late_reason, dbs_submitted_on").is("removed_at", null).in("about_check_instance", overdueIds)
        : Promise.resolve({ data: [] }),
      trackerPeople.length
        ? supabase.from("record_updates").select("person_id, about_tracker, created_at, author_name, late_reason, dbs_submitted_on").is("removed_at", null).not("about_tracker", "is", null).in("person_id", trackerPeople)
        : Promise.resolve({ data: [] }),
      awayPeople.length
        ? supabase.from("holiday_requests").select("person_id, start_date, end_date").eq("company_id", companyId).eq("status", "approved").in("person_id", awayPeople)
        : Promise.resolve({ data: [] }),
      awayPeople.length
        ? supabase.from("absence_events").select("person_id, start_date, end_date, return_date").eq("company_id", companyId).in("person_id", awayPeople)
        : Promise.resolve({ data: [] }),
    ]);
    const bookings = new Map<string, string[]>();
    const addBooking = (id: string | null, date: string | null) => {
      if (!id || !date || date < today) return;
      bookings.set(id, [...(bookings.get(id) ?? []), date]);
    };
    for (const b of (bookingRes.data as Array<{ check_instance_id: string | null; scheduled_date: string }> | null) ?? []) addBooking(b.check_instance_id, b.scheduled_date);
    for (const raw of (taskRes.data as unknown[]) ?? []) {
      const t = raw as { check_instance_id: string | null; status: string; planner_bookings: { scheduled_date: string; status: string } | Array<{ scheduled_date: string; status: string }> | null };
      const b = relOne(t.planner_bookings);
      if (!b || t.status === "cancelled" || b.status !== "planned") continue;
      addBooking(t.check_instance_id, b.scheduled_date);
    }
    const london = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(ts));
    type U = { created_at: string; author_name: string; late_reason: string | null; dbs_submitted_on: string | null };
    const toUpdate = (u: U): GapUpdate => ({
      on: london(u.created_at),
      by: u.author_name,
      reason: isLateReason(u.late_reason) ? u.late_reason : null,
      dbsSubmittedOn: u.dbs_submitted_on,
    });
    const updates = new Map<string, GapUpdate[]>();
    for (const u of (updateRes.data as Array<U & { about_check_instance: string }> | null) ?? []) {
      updates.set(u.about_check_instance, [...(updates.get(u.about_check_instance) ?? []), toUpdate(u)]);
    }
    for (const u of (trackerUpdateRes.data as Array<U & { person_id: string; about_tracker: string }> | null) ?? []) {
      const k = `${u.person_id}:${u.about_tracker}`;
      updates.set(k, [...(updates.get(k) ?? []), toUpdate(u)]);
    }
    const away = new Map<string, Array<{ from: string; to: string; what: "holiday" | "absence" }>>();
    for (const h of (holidayRes.data as Array<{ person_id: string; start_date: string; end_date: string | null }> | null) ?? []) {
      away.set(h.person_id, [...(away.get(h.person_id) ?? []), { from: h.start_date, to: h.end_date ?? h.start_date, what: "holiday" }]);
    }
    for (const e of (absenceRes.data as Array<{ person_id: string; start_date: string; end_date: string | null; return_date: string | null }> | null) ?? []) {
      away.set(e.person_id, [...(away.get(e.person_id) ?? []), { from: e.start_date, to: e.end_date ?? e.return_date ?? today, what: "absence" }]);
    }
    for (const item of all) {
      const planned = item.instanceId ? (bookings.get(item.instanceId) ?? []).sort()[0] ?? null : null;
      item.planned = planned;
    }
    for (const item of overdue) {
      const key = item.instanceId ?? `${item.recordId}:${item.aboutValue}`;
      const tracker = item.instanceId ? null : (item.aboutValue as "dbs_renewal" | "right_to_work");
      const g = assessGap({
        safety: item.safety,
        tracker,
        dueDate: item.dueDate,
        since: item.lastCompleted,
        todayIso: today,
        bookings: item.instanceId ? bookings.get(item.instanceId) ?? [] : [],
        updates: updates.get(key) ?? [],
        away: item.population === "people" ? away.get(item.recordId) ?? [] : [],
      });
      item.action = g.action;
      /* CIW's own words. CQC uses different enforcement terms, so a CQC company sees the action in
         place but no label until CQC's are agreed. */
      item.risk = regulator === "ciw" ? g.risk : null;
    }
    // Priority Action Notice risks first, then the oldest.
    const rank = (r: GapRisk | null) => (r === "pan_risk" ? 0 : r === "afi_likely" ? 1 : 2);
    for (const b of byCode.values()) {
      b.overdue.sort((a, c) => (rank(a.risk) === rank(c.risk) ? (a.dueDate < c.dueDate ? -1 : 1) : rank(a.risk) - rank(c.risk)));
    }
  }
  return byCode;
}

/** Previous readiness scores by requirement code (the most recent snapshot before
 *  today), for the trend delta. */
export async function getReadinessTrend(companyId: string, branchId: string | null = null): Promise<Map<string, number>> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  let q = supabase
    .from("framework_readiness_snapshots")
    .select("requirement_code, score, captured_on")
    .eq("company_id", companyId)
    .lt("captured_on", today);
  // The trend of THIS branch (0363); the company wide rows have no branch.
  q = branchId ? q.eq("branch_id", branchId) : q.is("branch_id", null);
  const { data } = await q.order("captured_on", { ascending: false });
  const prev = new Map<string, number>();
  for (const r of (data as Array<{ requirement_code: string; score: number }> | null) ?? []) {
    if (!prev.has(r.requirement_code)) prev.set(r.requirement_code, r.score);
  }
  return prev;
}
