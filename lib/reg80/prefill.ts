import "server-only";

/**
 * Be Care Compliant — Regulation 80 (RISCA Wales) Quality of Care Review prefill.
 * The six monthly quality of care review, per branch. Pulls as much of the report as
 * we already hold by REUSING the existing engines (no parallel logic): the PQS
 * measures for training / supervision / care plan / satisfaction / outcomes / SCW
 * rates, People for staffing and turnover, the compliance status view for overdue
 * competency and supervision counts, the Complaints module for the complaints
 * analysis, Evidence for the audit completion counts, Service User outcomes for the
 * outcomes picture, and the previous submitted review for the actions carry-forward.
 * Everything reads through the caller's RLS client (branch authorised). No dashes in copy.
 *
 * Reg 80(3) also requires analysing incidents, notifiable incidents, safeguarding and
 * whistleblowing. Since THE LIST item 21 we DO hold those, so they are pulled here too,
 * counted by the same pure modules the registers use (lib/incidents/summary,
 * lib/whistleblowing/summary) rather than by a second set of rules that would drift.
 *
 * WHISTLEBLOWING IS NOT PULLED FOR EVERYONE, and the reason matters. A branch manager can
 * view a saved Reg 80 report, and cannot read the whistleblowing register. Reading it here
 * through their RLS client would return zero rows, and zero rows would become the sentence
 * "no disclosures were received in the period" in a document that goes to CIW. So the
 * caller states whether this person may read them, and when they may not the field is left
 * ABSENT rather than filled with a zero: absent survives a Refresh, and a blank box the RI
 * fills in is recoverable in a way that a confident falsehood is not.
 */

import { createClient } from "@/lib/supabase/server";
import { getPqsMeasures, defaultOnTimeWindow } from "@/lib/export/on-time";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { summariseIncidents, type CountableIncident } from "@/lib/incidents/summary";
import {
  summariseDisclosures,
  type CountableDisclosure,
  type DisclosureSummary,
} from "@/lib/whistleblowing/summary";
import type { IncidentStatus } from "@/lib/incidents/types";
import type { DisclosureStatus } from "@/lib/whistleblowing/types";

const AUDIT_TARGET_PER_MONTH = 5; // the branch target the report grades audits against
const PERIOD_MONTHS = 6;

export type Split = { care: number; office: number; total: number };
export type Reg80Prefill = {
  branchId: string;
  branchName: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  staffing: { total: number; care: number; office: number; roles: { title: string; count: number }[] };
  turnover: {
    starters6: Split;
    starters12: Split;
    leavers6: Split;
    leavers12: Split;
  };
  complaints: {
    total6: number;
    total12: number;
    formality6: { type: string; count: number }[];
    concern6: { type: string; count: number }[];
    concern12: { type: string; count: number }[];
  };
  /** Incidents that OCCURRED in the period, in this branch. Branch scoped by RLS as well
   *  as by the query, so a manager's report covers their own branch and no other. */
  incidents: {
    total: number;
    notifiable: number;
    notified: number;
    awaitingNotification: number;
    safeguarding: number;
    referred: number;
    awaitingReferral: number;
    open: number;
    underReview: number;
    closed: number;
    byCategory: Array<{ category: string; count: number }>;
  };
  /** Disclosures RECEIVED in the period, company wide. `readable: false` means this person
   *  is not allowed to read the register - which is NOT the same as there being none, and
   *  the report must never turn one into the other. */
  whistleblowing: ({ readable: true } & DisclosureSummary) | { readable: false };
  audits: { people6: number; serviceUsers6: number; monthsInPeriod: number; targetPerMonth: number };
  outcomes: { totalServiceUsers: number; withOutcomes: number };
  overdue: {
    supervision: number;
    spotCheck: number;
    manualHandling: number;
    medication: number;
    audit: number;
    mentoring: number;
  };
  scw: { activeStaff: number; withoutRegistration: number };
  pqs: {
    mandatoryTraining: number | null;
    safeguarding: number | null;
    scwRegistration: number | null;
    supervisionOnTime: number | null;
    carePlanReviewOnTime: number | null;
    customerSatisfaction: number | null;
    personalOutcomes: number | null;
  };
  previousReview: { periodEnd: string | null; data: Record<string, unknown> } | null;
};

const pct = (v: number | null | undefined): number | null => (v == null ? null : v);

/** Shift a YYYY-MM-DD date by whole months, handling month and year boundaries. */
function shiftMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

/** Whole months between two YYYY-MM-DD dates, at least 1 (for the audit average). */
function monthsBetween(start: string, end: string): number {
  const [ay, am] = start.slice(0, 10).split("-").map(Number);
  const [by, bm] = end.slice(0, 10).split("-").map(Number);
  return Math.max(1, by * 12 + bm - (ay * 12 + am));
}

/** Rough split of a job title into care facing versus office, for the turnover table.
 *  The RI edits the narrative, so this only needs to be a sensible starting point. */
function classifyRole(title: string): "care" | "office" {
  const t = title.toLowerCase();
  if (/carer|care worker|care staff|care assistant|support worker|senior|community/.test(t)) return "care";
  return "office";
}

type PersonRow = {
  job_title: string | null;
  employment_status: string | null;
  start_date: string | null;
  leaver_date: string | null;
  scw_registration_number: string | null;
  archived_at: string | null;
};

function splitBy(rows: PersonRow[], predicate: (p: PersonRow) => boolean): Split {
  let care = 0;
  let office = 0;
  for (const p of rows) {
    if (!predicate(p)) continue;
    if (classifyRole(p.job_title ?? "") === "care") care += 1;
    else office += 1;
  }
  return { care, office, total: care + office };
}

export async function getReg80Prefill(input: {
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  /** The review period drives every windowed figure. Defaults to the last 6 months. */
  period?: { start: string; end: string };
  /** Whether THIS caller may read whistleblowing disclosures (Admin or Responsible
   *  Individual). Passed in rather than inferred, so the decision sits next to the profile
   *  that made it. False leaves the section absent; it never produces a zero. */
  canReadWhistleblowing?: boolean;
}): Promise<Reg80Prefill> {
  const supabase = await createClient();
  const today = formatCivilDate(todayInLondon());
  const periodEnd = input.period?.end || today;
  const periodStart = input.period?.start || shiftMonths(periodEnd, -PERIOD_MONTHS);
  const twelveMonthsAgo = shiftMonths(periodEnd, -12);
  const auditEnd = `${periodEnd}T23:59:59`;

  const [measures, peopleRes, statusRes, complaintsRes, auditDefsRes, suRes, outcomeRes, prevRes] =
    await Promise.all([
      getPqsMeasures({
        companyId: input.companyId,
        companyName: input.companyName,
        branchId: input.branchId,
        branchName: input.branchName,
        window: defaultOnTimeWindow(),
      }),
      supabase
        .from("people")
        .select("job_title, employment_status, start_date, leaver_date, scw_registration_number, archived_at")
        .eq("company_id", input.companyId)
        .eq("branch_id", input.branchId),
      supabase
        .from("person_check_status")
        .select("check_name, rag")
        .eq("company_id", input.companyId)
        .eq("branch_id", input.branchId),
      supabase
        .from("complaints")
        .select("formality, concern_type, date_raised, created_at")
        .eq("company_id", input.companyId)
        .eq("branch_id", input.branchId)
        .gte("date_raised", twelveMonthsAgo)
        .lte("date_raised", periodEnd),
      supabase
        .from("check_definitions")
        .select("form_id")
        .eq("company_id", input.companyId)
        .eq("key", "audit"),
      supabase
        .from("service_users")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("branch_id", input.branchId)
        .is("archived_at", null)
        .is("discharge_date", null),
      supabase
        .from("service_user_outcomes")
        .select("service_user_id")
        .eq("company_id", input.companyId)
        .is("archived_at", null),
      supabase
        .from("reg80_reviews")
        .select("period_end, data")
        .eq("company_id", input.companyId)
        .eq("branch_id", input.branchId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // PQS rates by measure name.
  const byName = new Map((measures as { name: string; rate: number | null }[]).map((m) => [m.name, m.rate]));
  const pqs = {
    mandatoryTraining: pct(byName.get("Mandatory training")),
    safeguarding: pct(byName.get("Safeguarding training")),
    scwRegistration: pct(byName.get("Social Care Wales registration")),
    supervisionOnTime: pct(byName.get("Supervision")),
    carePlanReviewOnTime: pct(byName.get("Care Plan Review")),
    customerSatisfaction: pct(byName.get("Customer satisfaction")),
    personalOutcomes: pct(byName.get("Personal outcomes")),
  };

  // People: staffing, turnover, SCW.
  const people = (peopleRes.data as PersonRow[] | null) ?? [];
  const active = people.filter((p) => !p.archived_at && p.employment_status !== "leaver");
  const notArchived = people.filter((p) => !p.archived_at);

  const roleMap = new Map<string, number>();
  for (const p of active) {
    const t = (p.job_title ?? "").trim() || "Not set";
    roleMap.set(t, (roleMap.get(t) ?? 0) + 1);
  }
  const roles = Array.from(roleMap.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);
  const activeSplit = splitBy(active, () => true);

  const startedIn = (lo: string) => (p: PersonRow) =>
    !!p.start_date && p.start_date >= lo && p.start_date <= periodEnd;
  const leftIn = (lo: string) => (p: PersonRow) =>
    p.employment_status === "leaver" && !!p.leaver_date && p.leaver_date >= lo && p.leaver_date <= periodEnd;

  const scwActive = active.length;
  const scwWithout = active.filter((p) => !(p.scw_registration_number ?? "").trim()).length;

  // Overdue counts (rag red) per check.
  const overdueMap = new Map<string, number>();
  for (const r of (statusRes.data as { check_name: string; rag: string }[] | null) ?? []) {
    if (r.rag === "red") overdueMap.set(r.check_name, (overdueMap.get(r.check_name) ?? 0) + 1);
  }
  const overdue = {
    supervision: overdueMap.get("Supervision") ?? 0,
    spotCheck: overdueMap.get("Spot Check") ?? 0,
    manualHandling: overdueMap.get("Manual Handling") ?? 0,
    medication: overdueMap.get("Medication Competency") ?? 0,
    audit: overdueMap.get("Audit") ?? 0,
    mentoring: overdueMap.get("Mentoring") ?? 0,
  };

  // Complaints: 12 months pulled, 6 months derived. Split by formality and concern.
  type Cx = { formality: string | null; concern_type: string | null; date_raised: string | null; created_at: string };
  const cx = (complaintsRes.data as Cx[] | null) ?? [];
  const dateOf = (c: Cx) => c.date_raised ?? c.created_at.slice(0, 10);
  const cx6 = cx.filter((c) => dateOf(c) >= periodStart && dateOf(c) <= periodEnd);
  const tally = (rows: Cx[], key: (c: Cx) => string) => {
    const m = new Map<string, number>();
    for (const c of rows) {
      const k = key(c);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  };

  // Audit completions in the period, by population.
  const auditFormIds = ((auditDefsRes.data as { form_id: string | null }[] | null) ?? [])
    .map((d) => d.form_id)
    .filter((x): x is string => !!x);
  let auditPeople = 0;
  let auditServiceUsers = 0;
  if (auditFormIds.length) {
    const { data: ev } = await supabase
      .from("evidence")
      .select("record_type")
      .eq("company_id", input.companyId)
      .eq("branch_id", input.branchId)
      .in("form_id", auditFormIds)
      .gte("submitted_at", periodStart)
      .lte("submitted_at", auditEnd);
    for (const e of (ev as { record_type: string }[] | null) ?? []) {
      if (e.record_type === "person") auditPeople += 1;
      else if (e.record_type === "service_user") auditServiceUsers += 1;
    }
  }

  // Outcomes: active service users in the branch, and how many have an outcome.
  const suIds = new Set(((suRes.data as { id: string }[] | null) ?? []).map((s) => s.id));
  const outcomeSuIds = new Set(
    ((outcomeRes.data as { service_user_id: string }[] | null) ?? [])
      .map((o) => o.service_user_id)
      .filter((id) => suIds.has(id)),
  );

  /*
   * Incidents and whistleblowing. Counted by the registers' own pure modules so the report
   * and the screen can never disagree about what "notifiable but not notified" means.
   *
   * Incidents are windowed on occurred_on, not on when they were typed up: a Reg 80 review
   * covers what happened in the period, whenever the paperwork caught up.
   */
  const { data: incidentRows } = await supabase
    .from("incidents")
    .select("occurred_on, category, notifiable, notified_on, safeguarding, safeguarding_referred_on, status")
    .eq("company_id", input.companyId)
    .eq("branch_id", input.branchId)
    .gte("occurred_on", periodStart)
    .lte("occurred_on", periodEnd);
  const incidentSummary = summariseIncidents(
    ((incidentRows as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
      occurred_on: r.occurred_on as string,
      category: r.category as string,
      notifiable: Boolean(r.notifiable),
      notified_on: (r.notified_on as string | null) ?? null,
      safeguarding: Boolean(r.safeguarding),
      safeguarding_referred_on: (r.safeguarding_referred_on as string | null) ?? null,
      status: r.status as IncidentStatus,
    })) satisfies CountableIncident[],
  );

  let disclosureSummary: Reg80Prefill["whistleblowing"] = { readable: false };
  if (input.canReadWhistleblowing) {
    const { data: wbRows } = await supabase
      .from("whistleblowing_disclosures")
      .select("received_on, category, anonymous, status, closed_on")
      .eq("company_id", input.companyId)
      .gte("received_on", periodStart)
      .lte("received_on", periodEnd);
    disclosureSummary = {
      readable: true,
      ...summariseDisclosures(
        ((wbRows as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
          received_on: r.received_on as string,
          category: r.category as string,
          anonymous: Boolean(r.anonymous),
          status: r.status as DisclosureStatus,
          closed_on: (r.closed_on as string | null) ?? null,
        })) satisfies CountableDisclosure[],
      ),
    };
  }

  return {
    branchId: input.branchId,
    branchName: input.branchName,
    generatedAt: today,
    periodStart,
    periodEnd,
    staffing: { total: active.length, care: activeSplit.care, office: activeSplit.office, roles },
    turnover: {
      starters6: splitBy(notArchived, startedIn(periodStart)),
      starters12: splitBy(notArchived, startedIn(twelveMonthsAgo)),
      leavers6: splitBy(notArchived, leftIn(periodStart)),
      leavers12: splitBy(notArchived, leftIn(twelveMonthsAgo)),
    },
    complaints: {
      total6: cx6.length,
      total12: cx.length,
      formality6: tally(cx6, (c) => (c.formality ?? "").trim() || "Not set"),
      concern6: tally(cx6, (c) => (c.concern_type ?? "").trim() || "Not categorised"),
      concern12: tally(cx, (c) => (c.concern_type ?? "").trim() || "Not categorised"),
    },
    incidents: incidentSummary,
    whistleblowing: disclosureSummary,
    audits: {
      people6: auditPeople,
      serviceUsers6: auditServiceUsers,
      monthsInPeriod: monthsBetween(periodStart, periodEnd),
      targetPerMonth: AUDIT_TARGET_PER_MONTH,
    },
    outcomes: { totalServiceUsers: suIds.size, withOutcomes: outcomeSuIds.size },
    overdue,
    scw: { activeStaff: scwActive, withoutRegistration: scwWithout },
    pqs,
    previousReview: prevRes.data
      ? {
          periodEnd: (prevRes.data as { period_end: string | null }).period_end ?? null,
          data: ((prevRes.data as { data: Record<string, unknown> | null }).data ?? {}) as Record<string, unknown>,
        }
      : null,
  };
}
