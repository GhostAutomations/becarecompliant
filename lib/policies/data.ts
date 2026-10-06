import "server-only";
import { getAbsenceConfig } from "@/lib/absence/data";
import { getProbationPeriod } from "@/lib/people/data";
import { settingsNeeded, systemSettingLines } from "./system-settings";
import { createClient } from "@/lib/supabase/server";
import { nationOf, type CompanyFacts, type PromptSource } from "./ai-prompt";

export type PolicyTopic = {
  key: string;
  title: string;
  summary: string;
  required_by: string[];
  questions: Array<{ key: string; label: string; type: "text" | "yesno" }>;
  source_keys: string[];
};

export async function listTopics(): Promise<PolicyTopic[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_topics")
    .select("key, title, summary, required_by, questions, source_keys")
    .eq("active", true)
    .order("sort");
  return (data as PolicyTopic[] | null) ?? [];
}

export async function getTopic(key: string): Promise<PolicyTopic | null> {
  return (await listTopics()).find((t) => t.key === key) ?? null;
}

/** The company as the AI should know it: name, regulator, branch names and what it provides. */
export async function companyFacts(companyId: string): Promise<CompanyFacts> {
  const supabase = await createClient();
  const [{ data: co }, { data: branches }] = await Promise.all([
    supabase.from("companies").select("name, regulator").eq("id", companyId).maybeSingle<{ name: string; regulator: string | null }>(),
    supabase.from("branches").select("name").eq("company_id", companyId).order("name"),
  ]);
  const reg = co?.regulator === "ciw" || co?.regulator === "cqc" ? co.regulator : null;
  return {
    name: co?.name ?? "The provider",
    regulator: reg,
    branches: ((branches as Array<{ name: string }> | null) ?? []).map((b) => b.name),
    services: "Domiciliary care and support for adults in their own homes",
  };
}

/** The fixed facts this policy must agree with, read from the company's own set up. */
export async function companySystemSettings(companyId: string, topicKey: string): Promise<string[]> {
  const need = settingsNeeded(topicKey);
  if (need.length === 0) return [];
  const [absence, probation] = await Promise.all([
    need.includes("absence") ? getAbsenceConfig(companyId) : Promise.resolve(null),
    need.includes("probation") ? getProbationPeriod(companyId) : Promise.resolve(null),
  ]);
  return systemSettingLines(topicKey, { absence, probation });
}

/** The approved text of a topic's sources for this company's nation, numbered for citing. */
export async function promptSources(topic: PolicyTopic, regulator: string | null): Promise<PromptSource[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_sources")
    .select("key, publisher, title, url, regions, current_text, approved_at")
    .in("key", topic.source_keys)
    .eq("active", true)
    .not("current_text", "is", null);
  const regions = nationOf(regulator).regions;
  const rows = ((data as Array<{ key: string; publisher: string; title: string; url: string; regions: string[]; current_text: string; approved_at: string | null }> | null) ?? [])
    .filter((s) => s.regions.some((r) => regions.includes(r)))
    .sort((a, b) => topic.source_keys.indexOf(a.key) - topic.source_keys.indexOf(b.key));
  return rows.map((s, i) => ({
    n: i + 1,
    publisher: s.publisher,
    title: s.title,
    url: s.url,
    checkedOn: s.approved_at
      ? new Date(s.approved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" })
      : "not recorded",
    text: s.current_text,
  }));
}

export type PolicyDraft = {
  id: string;
  topic_key: string;
  kind: "write" | "improve";
  policy_id: string | null;
  title: string;
  draft_text: string | null;
  review: unknown;
  sources: Array<{ n: number; title: string; publisher: string; url: string; checkedOn: string }>;
  status: "draft" | "approved" | "discarded";
  created_at: string;
  /** The regulator it was written for (ciw or cqc), so a Welsh draft is never mistaken for English. */
  nation: string | null;
  /** Who owns the policy, chosen when it was written (0403). */
  owner_id: string | null;
  /** The cover page choices from the Write page (0404). */
  cover: unknown;
};

/** The people who can own a policy: the management roles, active, in this company. */
export const POLICY_OWNER_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager"];

export async function listPolicyOwners(companyId: string): Promise<Array<{ id: string; full_name: string | null; role: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("company_id", companyId)
    .in("role", POLICY_OWNER_ROLES)
    .eq("status", "active")
    .order("full_name");
  return (data as Array<{ id: string; full_name: string | null; role: string }> | null) ?? [];
}

export async function getDraft(id: string, companyId: string): Promise<PolicyDraft | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_drafts")
    .select("id, topic_key, kind, policy_id, title, draft_text, review, sources, status, created_at, nation, owner_id, cover")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as PolicyDraft | null) ?? null;
}

export async function listOpenDrafts(companyId: string): Promise<PolicyDraft[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_drafts")
    .select("id, topic_key, kind, policy_id, title, draft_text, review, sources, status, created_at, nation, owner_id, cover")
    .eq("company_id", companyId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as PolicyDraft[] | null) ?? [];
}
