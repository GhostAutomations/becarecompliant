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
  checks: { overdue: number; dueSoon: number; onTrack: number; total: number };
  metrics: ReadinessMetric[];
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

    return {
      code: r.code,
      keyArea: r.key_area,
      title: r.title,
      description: r.description,
      status,
      checks,
      metrics,
    };
  });

  return { regulator, requirements: out };
}
