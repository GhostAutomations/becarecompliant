import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOutcomesRegister } from "@/lib/service-users/data";
import { getSatisfaction } from "@/lib/service-users/satisfaction";

/**
 * Inspection readiness against a regulator's framework. Each requirement (CIW
 * theme or CQC key question) rolls up the RAG of the checks mapped to it, plus
 * any outcomes / satisfaction metrics mapped to it. Everything reads through the
 * caller's RLS, so it is automatically scoped to their role and branch.
 */

export type Rag = "red" | "amber" | "green" | "none";

export type ReadinessMetric = { label: string; pct: number | null; note?: string };

export type RequirementReadiness = {
  code: string;
  keyArea: string;
  title: string;
  description: string;
  status: Rag;
  score: number | null; // 0-100 readiness score, or null when nothing is mapped
  checks: { overdue: number; dueSoon: number; onTrack: number; total: number };
  metrics: ReadinessMetric[];
};

export type FrameworkItem = {
  instanceId: string;
  recordId: string;
  recordName: string;
  checkName: string;
  dueDate: string;
  population: "people" | "service_users";
};

export type FrameworkReadiness = {
  regulator: "cqc" | "ciw";
  requirements: RequirementReadiness[];
};

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

export async function getFrameworkReadiness(
  companyId: string,
  regulator: "cqc" | "ciw",
): Promise<FrameworkReadiness> {
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
    supabase.rpc("get_framework_check_readiness", { p_company: companyId, p_regulator: regulator }),
  ]);

  type Req = { id: string; code: string; key_area: string; title: string; description: string };
  const requirements = (reqRes.data as Req[] | null) ?? [];
  const mapRows = (mapRes.data as Array<{ requirement_id: string; check_definition_id: string | null; source_kind: string | null }> | null) ?? [];
  const checkRows = (checkRes.data as Array<{ requirement_id: string; overdue: number; due_soon: number; on_track: number; total: number }> | null) ?? [];

  const checksByReq = new Map(checkRows.map((c) => [c.requirement_id, c]));
  const sourcesByReq = new Map<string, Set<string>>();
  for (const m of mapRows) {
    if (!m.source_kind || m.source_kind === "check") continue;
    const set = sourcesByReq.get(m.requirement_id) ?? new Set<string>();
    set.add(m.source_kind);
    sourcesByReq.set(m.requirement_id, set);
  }

  // Only load the supplementary metrics if some requirement maps them.
  const needsOutcomes = [...sourcesByReq.values()].some((s) => s.has("outcomes"));
  const needsSatisfaction = [...sourcesByReq.values()].some((s) => s.has("satisfaction"));
  const [outcomes, satisfaction] = await Promise.all([
    needsOutcomes ? getOutcomesRegister(companyId) : Promise.resolve(null),
    needsSatisfaction ? getSatisfaction(companyId) : Promise.resolve(null),
  ]);

  const out: RequirementReadiness[] = requirements.map((r) => {
    const c = checksByReq.get(r.id) ?? { overdue: 0, due_soon: 0, on_track: 0, total: 0 };
    const checks = { overdue: c.overdue, dueSoon: c.due_soon, onTrack: c.on_track, total: c.total };

    const metrics: ReadinessMetric[] = [];
    const sources = sourcesByReq.get(r.id) ?? new Set<string>();
    if (sources.has("outcomes") && outcomes) {
      metrics.push({ label: "Personal outcomes achieved or progressing", pct: outcomes.pqsPct });
    }
    if (sources.has("satisfaction") && satisfaction) {
      metrics.push({ label: "Customer satisfaction", pct: satisfaction.pct });
    }
    if (sources.has("training")) {
      metrics.push({ label: "Mandatory training", pct: null, note: "Tracked in the Training department" });
    }

    // Status: worst of the check rollup and the metric statuses.
    let status: Rag = "none";
    if (checks.total > 0) {
      status = worst(status, checks.overdue > 0 ? "red" : checks.dueSoon > 0 ? "amber" : "green");
    }
    for (const m of metrics) status = worst(status, pctToRag(m.pct));

    // Score: % of checks not overdue, averaged with any metric percentages.
    const signals: number[] = [];
    if (checks.total > 0) signals.push(Math.round((100 * (checks.total - checks.overdue)) / checks.total));
    for (const m of metrics) if (m.pct != null) signals.push(m.pct);
    const score = signals.length ? Math.round(signals.reduce((a, b) => a + b, 0) / signals.length) : null;

    return {
      code: r.code,
      keyArea: r.key_area,
      title: r.title,
      description: r.description,
      status,
      score,
      checks,
      metrics,
    };
  });

  return { regulator, requirements: out };
}

/** Overall readiness score across the mapped requirements (0-100), or null. */
export function overallScore(reqs: RequirementReadiness[]): number | null {
  const s = reqs.map((r) => r.score).filter((x): x is number => x != null);
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
}

/** The exact overdue and due-soon items behind each requirement, for the
 *  drill-down. Keyed by requirement code. RLS scopes to the caller. */
export async function getFrameworkItems(
  companyId: string,
  regulator: "cqc" | "ciw",
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
  if (defIds.length === 0) return byCode;

  const { data: inst } = await supabase
    .from("check_instances")
    .select("id, definition_id, due_date, record_type, person_id, service_user_id, check_definitions(name), people(full_name, employment_status, archived_at), service_users(full_name, service_status, archived_at)")
    .eq("company_id", companyId)
    .eq("active", true)
    .not("due_date", "is", null)
    .in("definition_id", defIds)
    .order("due_date", { ascending: true });

  for (const raw of (inst as unknown[]) ?? []) {
    const r = raw as {
      id: string; definition_id: string; due_date: string; record_type: string;
      person_id: string | null; service_user_id: string | null;
      check_definitions: { name: string } | { name: string }[] | null;
      people: { full_name: string; employment_status: string; archived_at: string | null } | { full_name: string; employment_status: string; archived_at: string | null }[] | null;
      service_users: { full_name: string; service_status: string; archived_at: string | null } | { full_name: string; service_status: string; archived_at: string | null }[] | null;
    };
    const def = relOne(r.check_definitions);
    let recordName: string | null = null;
    let recordId: string | null = null;
    let population: "people" | "service_users";
    if (r.record_type === "person") {
      const p = relOne(r.people);
      if (!p || p.employment_status !== "active" || p.archived_at) continue;
      recordName = p.full_name; recordId = r.person_id; population = "people";
    } else {
      const su = relOne(r.service_users);
      if (!su || su.service_status !== "active" || su.archived_at) continue;
      recordName = su.full_name; recordId = r.service_user_id; population = "service_users";
    }
    if (!recordId) continue;
    const code = defToCode.get(r.definition_id);
    if (!code) continue;

    const item: FrameworkItem = { instanceId: r.id, recordId, recordName: recordName!, checkName: def?.name ?? "check", dueDate: r.due_date, population };
    const bucket = byCode.get(code) ?? { overdue: [], dueSoon: [] };
    if (r.due_date < today) bucket.overdue.push(item);
    else {
      // due soon: within 30 days
      const [ty, tm, td] = today.split("-").map(Number);
      const in30 = new Date(Date.UTC(ty, tm - 1, td + 30)).toISOString().slice(0, 10);
      if (r.due_date <= in30) bucket.dueSoon.push(item);
    }
    byCode.set(code, bucket);
  }
  return byCode;
}

/** Previous readiness scores by requirement code (the most recent snapshot before
 *  today), for the trend delta. */
export async function getReadinessTrend(companyId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const { data } = await supabase
    .from("framework_readiness_snapshots")
    .select("requirement_code, score, captured_on")
    .eq("company_id", companyId)
    .lt("captured_on", today)
    .order("captured_on", { ascending: false });
  const prev = new Map<string, number>();
  for (const r of (data as Array<{ requirement_code: string; score: number }> | null) ?? []) {
    if (!prev.has(r.requirement_code)) prev.set(r.requirement_code, r.score);
  }
  return prev;
}
