"use server";

/**
 * Be Care Compliant — Regulation 73 (RI branch visit) actions.
 * Generate a pre-filled draft from the site data, save edits, AI-draft the narrative,
 * and submit (sign). Responsible Individual + admins + registered manager only; RLS
 * enforces it again. Client-redirect rule: return redirectTo, never redirect() to a
 * query URL. No dashes in copy.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { runAi } from "@/lib/ai/anthropic";
import { getReg73Prefill, type Reg73Prefill } from "@/lib/reg73/prefill";
import { REG73_SECTIONS, buildInitialData, reg73DataSummary, REG73_AI_FIELDS } from "@/lib/reg73/spec";
import type { ActionState } from "@/lib/forms";

const RI_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];
const ALL_KEYS = REG73_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

function collect(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALL_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string") out[key] = v;
  }
  const ai = formData.get("_ai_fields");
  if (typeof ai === "string") out._ai_fields = ai;
  const method = formData.get("sign_method");
  if (typeof method === "string") out.sign_method = method;
  return out;
}

async function guard() {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." as const };
  if (!RI_ROLES.includes(profile.role)) {
    return { error: "Only the Responsible Individual or an Admin can run this report." as const };
  }
  return { profile };
}

export async function createReg73Draft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { profile } = g;
  const companyId = profile.company_id!;
  const branchId = String(formData.get("branch_id") ?? "");
  if (!branchId) return { error: "Choose a branch." };

  const supabase = await createClient();
  const [{ data: branch }, { data: company }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", branchId).eq("company_id", companyId).maybeSingle(),
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
  ]);
  if (!branch) return { error: "That branch is not in your view." };
  const branchName = (branch.name as string) ?? "Branch";
  const companyName = (company?.name as string) ?? "Company";

  const prefill = await getReg73Prefill({ companyId, companyName, branchId, branchName });
  const initial = buildInitialData(prefill, profile.full_name ?? "");
  const reference = `Reg 73 ${branchName} ${initial.start_date}`;

  const { data: row, error } = await supabase
    .from("reg73_visits")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      reference,
      ri_name: initial.ri_name,
      start_date: initial.start_date,
      end_date: initial.end_date,
      status: "draft",
      data: initial,
      prefill,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !row) return { error: error?.message ?? "Could not start the visit." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg73.created",
    entityType: "reg73_visit",
    entityId: row.id as string,
    summary: `Started a Regulation 73 visit for ${branchName}`,
    metadata: { branch_id: branchId },
  });

  return { redirectTo: `/reports/reg73/${row.id}` };
}

async function persist(
  id: string,
  data: Record<string, string>,
  patch: Record<string, unknown>,
): Promise<ActionState | null> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("reg73_visits")
    .update({
      data,
      ri_name: data.ri_name ?? null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      updated_by: g.profile.id,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/reports/reg73/${id}`);
  return null;
}

export async function deleteReg73Visits(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const ids = String(formData.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return { error: "Select at least one report to delete." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reg73_visits")
    .delete()
    .in("id", ids)
    .eq("company_id", g.profile.company_id!);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: g.profile.company_id!,
    actorId: g.profile.id,
    actorEmail: g.profile.email,
    actorRole: g.profile.role,
    action: "reg73.deleted",
    entityType: "reg73_visit",
    entityId: null,
    summary: `Deleted ${ids.length} Regulation 73 report(s)`,
    metadata: { count: ids.length },
  });
  revalidatePath("/reports/reg73/reports");
  return { ok: `${ids.length} report(s) deleted.` };
}

export async function saveReg73(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("visit_id") ?? "");
  if (!id) return { error: "Missing visit." };
  const res = await persist(id, collect(formData), {});
  return res ?? { ok: "Saved." };
}

export async function submitReg73(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("visit_id") ?? "");
  if (!id) return { error: "Missing visit." };
  const data = collect(formData);
  const method = data.sign_method;
  if (!method) return { error: "Choose a signature option before submitting." };
  if ((method === "draw" || method === "upload") && !(data.ri_signature ?? "").startsWith("data:image")) {
    return { error: "Add your signature, or choose to sign the printed version." };
  }
  const res = await persist(id, data, { status: "submitted", submitted_at: new Date().toISOString() });
  if (res) return res;

  const { profile } = await requireCompany();
  await writeAudit({
    companyId: profile.company_id!,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg73.submitted",
    entityType: "reg73_visit",
    entityId: id,
    summary: "Submitted a Regulation 73 visit",
    metadata: {},
  });
  return { ok: "Submitted." };
}

/**
 * Draft the narrative sections from the pulled data and RETURN them as JSON in `ok`
 * (mirrors the complaints AI response pattern). The client sets them into the fields
 * and marks them gold; nothing is saved until the RI saves the form.
 */
export async function aiDraftReg73(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { profile } = g;
  const id = String(formData.get("visit_id") ?? "");
  if (!id) return { error: "Missing visit." };

  const supabase = await createClient();
  const { data: row } = await supabase.from("reg73_visits").select("prefill").eq("id", id).maybeSingle();
  if (!row) return { error: "That visit could not be found." };
  const prefill = (row.prefill ?? {}) as Reg73Prefill;

  const result = await runAi({
    companyId: profile.company_id!,
    feature: "reg73",
    maxTokens: 1400,
    system:
      "You draft sections of a UK care Regulation 73 Responsible Individual branch visit report. Write plain, professional, factual English in the first person plural where natural. Do not invent facts beyond the data given. Do not use dashes; use commas, colons and full stops. Return ONLY a JSON object with string values for these keys: plan, staff_feedback_quality, staff_feedback_outcomes, su_feedback_consistent, su_feedback_outcomes.",
    prompt: `Branch data for this visit:\n${reg73DataSummary(prefill)}\n\nDraft each section as concise professional narrative the Responsible Individual can edit. Return only the JSON object.`,
  });
  if ("error" in result) return { error: result.error };

  // Normalise to a JSON object of just the AI keys, so the client can trust the shape.
  let drafted: Record<string, string> = {};
  try {
    const match = result.ok.match(/\{[\s\S]*\}/);
    drafted = JSON.parse(match ? match[0] : result.ok) as Record<string, string>;
  } catch {
    drafted = { plan: result.ok.trim() };
  }
  const clean: Record<string, string> = {};
  for (const key of REG73_AI_FIELDS) {
    if (typeof drafted[key] === "string" && drafted[key].trim()) clean[key] = drafted[key].trim();
  }
  return { ok: JSON.stringify(clean) };
}

/**
 * Re-pull the live figures from the site and refresh the data-derived boxes (KPI
 * dashboard, previous actions status), leaving the RI's narrative untouched.
 */
export async function refreshReg73Data(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { profile } = g;
  const id = String(formData.get("visit_id") ?? "");
  if (!id) return { error: "Missing visit." };
  const companyId = profile.company_id!;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("reg73_visits")
    .select("branch_id, data")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "That visit could not be found." };

  const [{ data: branch }, { data: company }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", row.branch_id as string).maybeSingle(),
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
  ]);
  const branchName = (branch?.name as string) ?? "Branch";
  const prefill = await getReg73Prefill({
    companyId,
    companyName: (company?.name as string) ?? "Company",
    branchId: row.branch_id as string,
    branchName,
  });
  const fresh = buildInitialData(prefill, (row.data as Record<string, string>)?.ri_name ?? profile.full_name ?? "");
  const data = { ...(row.data as Record<string, string>), kpi_dashboard: fresh.kpi_dashboard, prev_actions_status: fresh.prev_actions_status };

  const { error } = await supabase
    .from("reg73_visits")
    .update({ data, prefill, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/reports/reg73/${id}`);
  return { ok: "Data refreshed from the site." };
}
