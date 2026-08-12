"use server";

/**
 * Be Care Compliant — Regulation 80 (Quality of Care Review) actions.
 * Generate a pre-filled draft from the site data, save edits, AI-draft the narrative,
 * refresh the data boxes, and submit (sign). Responsible Individual + admins +
 * registered manager only; RLS enforces it again. Client-redirect rule: return
 * redirectTo, never redirect() to a query URL. No dashes in copy.
 *
 * Uploaded images (survey chart, call duration table) arrive as data URLs in the same
 * form fields and are stored in `data` jsonb alongside the text, exactly like the
 * drawn signature. The shared PDF engine embeds them.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { runAi } from "@/lib/ai/anthropic";
import { getReg80Prefill, type Reg80Prefill } from "@/lib/reg80/prefill";
import { REG80_SECTIONS, REG80_AI_FIELDS, REG80_DATA_FIELDS, buildInitialData, reg80DataSummary } from "@/lib/reg80/spec";
import type { ActionState } from "@/lib/forms";

const RI_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];
const ALL_KEYS = REG80_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

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

/** Who may have the whistleblowing figures pulled into their draft. The same two roles the
 *  register itself admits (migrations 0174, 0175 and 0177). A Registered Manager is NOT one
 *  of them, deliberately: they can author a Reg 80 review, and they still cannot read
 *  disclosures. */
const CAN_READ_WHISTLEBLOWING = ["company_admin", "registered_individual"];

export async function createReg80Draft(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const prefill = await getReg80Prefill({
    companyId,
    companyName,
    branchId,
    branchName,
    canReadWhistleblowing: CAN_READ_WHISTLEBLOWING.includes(profile.role),
  });
  const initial = buildInitialData(prefill, profile.full_name ?? "");
  const reference = `Reg 80 ${branchName} ${initial.period_end}`;

  const { data: row, error } = await supabase
    .from("reg80_reviews")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      reference,
      ri_name: initial.ri_name,
      period_start: initial.period_start,
      period_end: initial.period_end,
      status: "draft",
      data: initial,
      prefill,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !row) return { error: error?.message ?? "Could not start the review." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg80.created",
    entityType: "reg80_review",
    entityId: row.id as string,
    summary: `Started a Regulation 80 quality of care review for ${branchName}`,
    metadata: { branch_id: branchId },
  });

  return { redirectTo: `/reports/reg80/${row.id}` };
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
    .from("reg80_reviews")
    .update({
      data,
      ri_name: data.ri_name ?? null,
      period_start: data.period_start || null,
      period_end: data.period_end || null,
      updated_by: g.profile.id,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/reports/reg80/${id}`);
  return null;
}

export async function saveReg80(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("review_id") ?? "");
  if (!id) return { error: "Missing review." };
  const res = await persist(id, collect(formData), {});
  return res ?? { ok: "Saved." };
}

export async function submitReg80(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("review_id") ?? "");
  if (!id) return { error: "Missing review." };
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
    action: "reg80.submitted",
    entityType: "reg80_review",
    entityId: id,
    summary: "Submitted a Regulation 80 quality of care review",
    metadata: {},
  });
  return { ok: "Submitted." };
}

/**
 * Draft the narrative sections from the pulled data and RETURN them as JSON in `ok`
 * (mirrors the Reg 73 pattern). The client sets them into the fields and marks them
 * gold; nothing is saved until the RI saves the form. The AI is told to use only the
 * data given, so it never invents the incidents or safeguarding narrative we do not hold.
 */
export async function aiDraftReg80(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { profile } = g;
  const id = String(formData.get("review_id") ?? "");
  if (!id) return { error: "Missing review." };

  const supabase = await createClient();
  const { data: row } = await supabase.from("reg80_reviews").select("prefill").eq("id", id).maybeSingle();
  if (!row) return { error: "That review could not be found." };
  const prefill = (row.prefill ?? {}) as Reg80Prefill;

  const result = await runAi({
    companyId: profile.company_id!,
    feature: "reg80",
    maxTokens: 3000,
    system:
      "You draft sections of a UK care Regulation 80 six monthly Quality of Care Review report. Write plain, professional, factual English in the first person plural where natural. Use ONLY the data provided; do not invent figures, incidents, safeguarding matters or events. When referring to our systems, use plain terms like the compliance matrix and the registers, never the word 'board'. Do not use dashes; use commas, colons and full stops. Return ONLY a JSON object with string values for these keys: " +
      REG80_AI_FIELDS.join(", ") +
      ". Each value is a concise professional paragraph the Responsible Individual can edit. 'overall_assessment' is your assessment of the standard of care and support; 'recommendations' is a short list of recommendations for improvement.",
    prompt: `Review data:\n${reg80DataSummary(prefill)}\n\nDraft each section. Return only the JSON object.`,
  });
  if ("error" in result) return { error: result.error };

  let drafted: Record<string, string> = {};
  try {
    const match = result.ok.match(/\{[\s\S]*\}/);
    drafted = JSON.parse(match ? match[0] : result.ok) as Record<string, string>;
  } catch {
    drafted = { overall_assessment: result.ok.trim() };
  }
  const clean: Record<string, string> = {};
  for (const key of REG80_AI_FIELDS) {
    if (typeof drafted[key] === "string" && drafted[key].trim()) clean[key] = drafted[key].trim();
  }
  return { ok: JSON.stringify(clean) };
}

/**
 * Re-pull the live figures and refresh the data-derived boxes, returning them as JSON
 * so the client updates them in place (no remount, so the RI's narrative and the Saved
 * state survive).
 */
export async function refreshReg80Data(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { profile } = g;
  const id = String(formData.get("review_id") ?? "");
  if (!id) return { error: "Missing review." };
  const companyId = profile.company_id!;

  // The review period the RI currently has in the form drives every figure, so a
  // changed date range re-pulls the numbers for that range.
  const ps = String(formData.get("period_start") ?? "").slice(0, 10);
  const pe = String(formData.get("period_end") ?? "").slice(0, 10);
  const period = ps && pe ? { start: ps, end: pe } : undefined;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("reg80_reviews")
    .select("branch_id, data")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "That review could not be found." };

  const [{ data: branch }, { data: company }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", row.branch_id as string).maybeSingle(),
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
  ]);
  const branchName = (branch?.name as string) ?? "Branch";
  const prefill = await getReg80Prefill({
    companyId,
    companyName: (company?.name as string) ?? "Company",
    branchId: row.branch_id as string,
    branchName,
    period,
    canReadWhistleblowing: CAN_READ_WHISTLEBLOWING.includes(profile.role),
  });
  const oldData = (row.data as Record<string, string>) ?? {};
  const fresh = buildInitialData(prefill, oldData.ri_name ?? profile.full_name ?? "");

  const refreshed: Record<string, string> = {};
  for (const key of REG80_DATA_FIELDS) if (typeof fresh[key] === "string") refreshed[key] = fresh[key];
  const data = { ...oldData, ...refreshed, ...(ps ? { period_start: ps } : {}), ...(pe ? { period_end: pe } : {}) };

  const patch: Record<string, unknown> = {
    data,
    prefill,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  };
  if (period) {
    patch.period_start = period.start;
    patch.period_end = period.end;
  }
  const { error } = await supabase.from("reg80_reviews").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return { ok: JSON.stringify(refreshed) };
}

export async function deleteReg80Reviews(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const ids = String(formData.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return { error: "Select at least one report to delete." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reg80_reviews")
    .delete()
    .in("id", ids)
    .eq("company_id", g.profile.company_id!);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: g.profile.company_id!,
    actorId: g.profile.id,
    actorEmail: g.profile.email,
    actorRole: g.profile.role,
    action: "reg80.deleted",
    entityType: "reg80_review",
    entityId: null,
    summary: `Deleted ${ids.length} Regulation 80 report(s)`,
    metadata: { count: ids.length },
  });
  revalidatePath("/reports/reg80/reports");
  return { ok: `${ids.length} report(s) deleted.` };
}
