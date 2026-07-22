"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getFrameworkReadiness } from "@/lib/framework/data";
import { runAi } from "@/lib/ai/anthropic";

type Result = { ok: string } | { error: string };

function relOne<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const REG_LABEL: Record<string, string> = {
  ciw: "Care Inspectorate Wales (CIW), Wales",
  cqc: "Care Quality Commission (CQC), England",
};

/** Guard + resolve the company's regulator; returns null if the module is off. */
async function resolve(): Promise<{ companyId: string; regulator: "cqc" | "ciw"; name: string } | null> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("framework_enabled, regulator, name")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (!data?.framework_enabled) return null;
  return { companyId: profile.company_id, regulator: (data.regulator ?? "ciw") as "cqc" | "ciw", name: data.name as string };
}

/** Build a compact, grounded context: readiness per requirement plus a capped
 *  list of overdue items. RLS scopes everything to the caller. */
async function buildContext(companyId: string, regulator: "cqc" | "ciw", name: string): Promise<string> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  const { requirements } = await getFrameworkReadiness(companyId, regulator);

  // Map of check definition id -> requirement title, for labelling overdue items.
  const { data: mapRows } = await supabase
    .from("requirement_evidence_map")
    .select("check_definition_id, framework_requirements!inner(regulator, title)")
    .eq("company_id", companyId)
    .not("check_definition_id", "is", null);
  const defToArea = new Map<string, string>();
  for (const m of (mapRows as Array<{ check_definition_id: string; framework_requirements: { regulator: string; title: string } | { regulator: string; title: string }[] }> | null) ?? []) {
    const fr = relOne(m.framework_requirements);
    if (fr && fr.regulator === regulator && m.check_definition_id) defToArea.set(m.check_definition_id, fr.title);
  }
  const defIds = [...defToArea.keys()];

  const overdueLines: string[] = [];
  if (defIds.length > 0) {
    const { data: inst } = await supabase
      .from("check_instances")
      .select("definition_id, due_date, record_type, check_definitions(name), people(full_name, employment_status, archived_at), service_users(full_name, service_status, archived_at)")
      .eq("company_id", companyId)
      .eq("active", true)
      .lt("due_date", today)
      .in("definition_id", defIds)
      .order("due_date", { ascending: true })
      .limit(60);
    for (const raw of (inst as unknown[] ?? [])) {
      const r = raw as {
        definition_id: string; due_date: string; record_type: string;
        check_definitions: { name: string } | { name: string }[] | null;
        people: { full_name: string; employment_status: string; archived_at: string | null } | { full_name: string; employment_status: string; archived_at: string | null }[] | null;
        service_users: { full_name: string; service_status: string; archived_at: string | null } | { full_name: string; service_status: string; archived_at: string | null }[] | null;
      };
      const def = relOne(r.check_definitions);
      let recordName: string | null = null;
      if (r.record_type === "person") {
        const p = relOne(r.people);
        if (!p || p.employment_status !== "active" || p.archived_at) continue;
        recordName = p.full_name;
      } else {
        const su = relOne(r.service_users);
        if (!su || su.service_status !== "active" || su.archived_at) continue;
        recordName = su.full_name;
      }
      overdueLines.push(`- ${recordName} — ${def?.name ?? "check"} — due ${r.due_date} (${defToArea.get(r.definition_id) ?? "?"})`);
      if (overdueLines.length >= 40) break;
    }
  }

  const reqLines = requirements.map((r) => {
    const parts: string[] = [];
    if (r.checks.total > 0) parts.push(`checks ${r.checks.overdue} overdue, ${r.checks.dueSoon} due soon, ${r.checks.onTrack} on track`);
    for (const m of r.metrics) parts.push(`${m.label} ${m.pct != null ? `${m.pct}%` : (m.note ?? "n/a")}`);
    return `- ${r.title} [${r.status}]: ${parts.length ? parts.join("; ") : "no evidence mapped"}`;
  });

  return [
    `Regulator: ${REG_LABEL[regulator]}. Provider: ${name}. Date: ${today}.`,
    `Readiness by ${regulator === "ciw" ? "theme" : "key question"}:`,
    ...reqLines,
    overdueLines.length ? `Overdue items (record — check — due date — area):` : `No overdue items.`,
    ...overdueLines,
  ].join("\n");
}

const SYSTEM = (regulator: string) =>
  `You are an experienced UK care compliance adviser helping a provider prepare for a ${regulator === "ciw" ? "Care Inspectorate Wales (CIW)" : "Care Quality Commission (CQC)"} inspection. Use ONLY the data you are given. Never invent people, facts or figures. Use UK spelling and plain English. Be honest about weaknesses. Make clear this is a preparation aid based on the provider's own live data, not a regulatory rating or legal advice.`;

/** Draft an inspection readiness narrative + prioritised gaps and actions. */
export async function draftReadinessNarrative(): Promise<Result> {
  const ctx = await resolve();
  if (!ctx) return { error: "Inspection Readiness is not enabled for this company." };
  const context = await buildContext(ctx.companyId, ctx.regulator, ctx.name);
  const prompt = `${context}\n\nWrite two sections in markdown:\n1. "Readiness summary": for each ${ctx.regulator === "ciw" ? "theme" : "key question"}, 2 to 4 sentences on what is strong and what needs attention.\n2. "Gaps and actions": a prioritised list, most urgent first, each action specific and tied to the data above (name the records/checks where relevant).`;
  return runAi({ companyId: ctx.companyId, feature: "framework_narrative", system: SYSTEM(ctx.regulator), prompt, maxTokens: 1800 });
}

/** Answer a manager's question grounded in the readiness data. */
export async function askReadiness(question: string): Promise<Result> {
  const q = (question ?? "").trim();
  if (!q) return { error: "Type a question first." };
  const ctx = await resolve();
  if (!ctx) return { error: "Inspection Readiness is not enabled for this company." };
  const context = await buildContext(ctx.companyId, ctx.regulator, ctx.name);
  const prompt = `${context}\n\nThe manager asks: "${q}"\nAnswer using ONLY the data above. If the answer is not in the data, say you do not have that information. Be concise and specific, and refer to the exact records or checks where relevant.`;
  return runAi({ companyId: ctx.companyId, feature: "framework_qa", system: SYSTEM(ctx.regulator), prompt, maxTokens: 900 });
}
