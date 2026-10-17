"use server";

/**
 * Be Care Compliant: change the cancellation reasons and rules (Stage 7b part 2b). Company Admins
 * only, here and in RLS (0510), and only while the company has Rota and Visits on. Other always
 * stays; reasons are archived, never deleted, because cancelled visits will point at them.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { foreignLinkError } from "@/lib/companies/links";
import { writeAudit } from "@/lib/audit";
import { durationWords, parseRule, reasonLabelProblem } from "@/lib/rota/cancellations";
import type { ActionState } from "@/lib/forms";

async function guard() {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "Select a company first." } as const;
  if (!moduleOnInRow(await getCompanyRow(companyId), "rota_visits")) return { error: "Rota and Visits is not switched on for your company." } as const;
  return { user, profile, companyId } as const;
}

function audit(g: Exclude<Awaited<ReturnType<typeof guard>>, { error: string }>, action: string, summary: string, metadata: Record<string, unknown>) {
  return writeAudit({
    companyId: g.companyId,
    actorId: g.user.id,
    actorEmail: g.profile.email,
    actorRole: g.profile.role,
    action,
    entityType: "company",
    entityId: g.companyId,
    summary,
    metadata,
  });
}

const TAKEN = "That reason is already on your list.";
const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\s+/g, " ").trim();

export async function addCancelReasonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const label = clean(formData.get("label"));
  const problem = reasonLabelProblem(label);
  if (problem) return { error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rota_cancel_reasons")
    .insert({ company_id: g.companyId, label, chargeable: formData.get("chargeable") === "on", carer_paid: formData.get("carer_paid") === "on", created_by: g.user.id })
    .select("id");
  if (error) return { error: error.code === "23505" ? TAKEN : error.message };
  if (!data?.length) return { error: "The reason could not be added." };
  await audit(g, "rota.cancel_reason_added", `Added the cancellation reason ${label}`, { reason_id: (data[0] as { id: string }).id });
  revalidatePath("/settings/rota");
  return { ok: "Added." };
}

export async function saveCancelReasonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = String(formData.get("reason_id") ?? "");
  const supabase = await createClient();
  const { data: current } = await supabase.from("rota_cancel_reasons").select("code").eq("id", id).eq("company_id", g.companyId).maybeSingle();
  if (!current) return { error: "That reason could not be found." };
  // Other keeps its name: it is the one where the office types its own words.
  const isOther = (current as { code: string | null }).code === "other";
  const label = isOther ? "Other" : clean(formData.get("label"));
  const problem = reasonLabelProblem(label);
  if (problem) return { error: problem };
  const chargeable = formData.get("chargeable") === "on";
  const carerPaid = formData.get("carer_paid") === "on";
  const { data, error } = await supabase
    .from("rota_cancel_reasons")
    .update({ label, chargeable, carer_paid: carerPaid })
    .eq("id", id)
    .eq("company_id", g.companyId)
    .select("id");
  if (error) return { error: error.code === "23505" ? TAKEN : error.message };
  if (!data?.length) return { error: "That reason could not be changed." };
  await audit(g, "rota.cancel_reason_saved", `Saved the cancellation reason ${label}`, { reason_id: id, chargeable, carer_paid: carerPaid });
  revalidatePath("/settings/rota");
  return { ok: "Saved." };
}

export async function setCancelReasonArchivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = String(formData.get("reason_id") ?? "");
  const archive = formData.get("archive") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rota_cancel_reasons")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("company_id", g.companyId)
    .select("label");
  if (error) return { error: error.code === "23514" ? "Other cannot be archived." : error.message };
  if (!data?.length) return { error: "That reason could not be changed." };
  const label = (data[0] as { label: string }).label;
  await audit(g, archive ? "rota.cancel_reason_archived" : "rota.cancel_reason_restored", `${archive ? "Archived" : "Restored"} the cancellation reason ${label}`, { reason_id: id });
  revalidatePath("/settings/rota");
  return { ok: archive ? "Archived." : "Restored." };
}

/** Save a branch default or a funder's own rule. */
export async function saveCancelRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const scope = String(formData.get("scope") ?? "");
  const scopeId = String(formData.get("scope_id") ?? "");
  if (scope !== "branch" && scope !== "funder") return { error: "Missing branch or funder." };
  const foreign = await foreignLinkError(g.companyId, scope === "branch" ? { branchId: scopeId } : { funderId: scopeId });
  if (foreign) return { error: foreign };
  const parsed = parseRule((n) => formData.get(n));
  if ("error" in parsed) return { error: parsed.error };
  const { rule } = parsed;

  const supabase = await createClient();
  const col = scope === "branch" ? "branch_id" : "funder_id";
  const values = { notice_hours: rule.noticeHours, charge_hours: rule.chargeHours, pay_hours: rule.payHours, updated_at: new Date().toISOString(), updated_by: g.user.id };
  const { data: existing } = await supabase.from("rota_cancel_rules").select("id").eq(col, scopeId).maybeSingle();
  const { data, error } = existing
    ? await supabase.from("rota_cancel_rules").update(values).eq("id", (existing as { id: string }).id).select("id")
    : await supabase.from("rota_cancel_rules").insert({ company_id: g.companyId, [col]: scopeId, ...values }).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "The rule could not be saved." };
  await audit(
    g,
    "rota.cancel_rule_saved",
    `Cancellation rule: notice ${durationWords(rule.noticeHours)}, charged ${durationWords(rule.chargeHours)}, carer paid ${durationWords(rule.payHours)}`,
    { scope, scope_id: scopeId, ...values },
  );
  revalidatePath("/settings/rota");
  return { ok: "Saved." };
}

/** A funder goes back to each branch's default. */
export async function clearFunderRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const funderId = String(formData.get("scope_id") ?? "");
  const foreign = await foreignLinkError(g.companyId, { funderId });
  if (foreign) return { error: foreign };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_cancel_rules").delete().eq("funder_id", funderId).eq("company_id", g.companyId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That funder has no rule of its own." };
  await audit(g, "rota.cancel_rule_cleared", "A funder now uses each branch's default cancellation rule", { funder_id: funderId });
  revalidatePath("/settings/rota");
  return { ok: "Removed." };
}
