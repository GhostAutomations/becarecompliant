import "server-only";

/**
 * Be Care Compliant: what the Settings, Rota cancellations part shows (0510). Read as the caller;
 * the company's reasons are put in place first if it has none (rota_cancel_reasons_ensure).
 */

import { createClient } from "@/lib/supabase/server";
import { sortReasons, type CancelReason, type CancelRule } from "@/lib/rota/cancellations";

export type RuleRow = { scopeId: string; name: string; rule: CancelRule | null; archived?: boolean };

export async function getCancelSettings(companyId: string): Promise<{
  reasons: CancelReason[];
  branches: RuleRow[];
  funders: RuleRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { error: ensureError } = await supabase.rpc("rota_cancel_reasons_ensure", { p_company: companyId });
  const [reasonsQ, rulesQ, branchesQ, fundersQ] = await Promise.all([
    supabase.from("rota_cancel_reasons").select("id, code, label, chargeable, carer_paid, archived_at").eq("company_id", companyId),
    supabase.from("rota_cancel_rules").select("branch_id, funder_id, notice_hours, charge_hours, pay_hours").eq("company_id", companyId),
    supabase.from("branches").select("id, name").eq("company_id", companyId).order("name"),
    supabase.from("funders").select("id, name, archived_at").eq("company_id", companyId),
  ]);
  type Rule = { branch_id: string | null; funder_id: string | null; notice_hours: number; charge_hours: number; pay_hours: number };
  const rules = (rulesQ.data as Rule[] | null) ?? [];
  const toRule = (r: Rule | undefined): CancelRule | null => (r ? { noticeHours: r.notice_hours, chargeHours: r.charge_hours, payHours: r.pay_hours } : null);

  const reasons = sortReasons(
    ((reasonsQ.data as { id: string; code: string | null; label: string; chargeable: boolean; carer_paid: boolean; archived_at: string | null }[] | null) ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      chargeable: r.chargeable,
      carerPaid: r.carer_paid,
      archivedAt: r.archived_at,
    })),
  );
  const branches = ((branchesQ.data as { id: string; name: string }[] | null) ?? []).map((b) => ({
    scopeId: b.id,
    name: b.name,
    rule: toRule(rules.find((r) => r.branch_id === b.id)),
  }));
  // Live funders A to Z, then archived ones that still have a rule.
  const funders = ((fundersQ.data as { id: string; name: string; archived_at: string | null }[] | null) ?? [])
    .map((f) => ({ scopeId: f.id, name: f.name, archived: !!f.archived_at, rule: toRule(rules.find((r) => r.funder_id === f.id)) }))
    .filter((f) => !f.archived || f.rule)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));

  const error = ensureError?.message ?? reasonsQ.error?.message ?? rulesQ.error?.message ?? null;
  return { reasons, branches, funders, error };
}
