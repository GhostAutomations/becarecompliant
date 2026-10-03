import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSIONS, legalPublished } from "@/lib/legal/documents";
import { acceptanceCurrent, agreementGateOn } from "@/lib/legal/fill";
import { getCompanyRow } from "@/lib/companies/row";

/**
 * The agreement gate's database half (0346).
 *
 * WHO IT STOPS. Only a Company Admin (Phil, 2026-09-26: "only the Company Admin is stopped until
 * they accept; other roles carry on"). requireCompany asks needsAgreement for a Company Admin and
 * nobody else, and the founder never reaches it (requireCompany returns early for the founder).
 *
 * WHEN. Once the supplier details are filled in (legalPublished), for every company. Before then,
 * only for a company the founder has switched on to test it (companies.agreement_required).
 *
 * A READ THAT FAILS DOES NOT LOCK ANYBODY OUT. The same rule as the trial gate: a query that did
 * not answer must never be the reason somebody cannot reach their own records. The gate is a
 * contract formality, not a security boundary; RLS is the security boundary.
 *
 * React cache() dedupes it per request, because requireCompany runs many times in one render.
 */

export type AcceptanceRow = {
  id: string;
  company_id: string | null;
  accepted_by_name: string;
  accepted_by_email: string;
  agreement_version: string;
  dpa_version: string;
  agreement_sha256: string;
  dpa_sha256: string;
  is_draft: boolean;
  customer_legal_name: string;
  organisation_type: string;
  company_number: string | null;
  customer_address: string;
  plan: string;
  billing_option: string;
  price_text: string | null;
  included_text: string | null;
  price_list_date: string | null;
  branches_ordered: number | null;
  branches_text: string | null;
  extra_users: number | null;
  extra_branches: number | null;
  extra_users_text: string | null;
  extras_billing: string | null;
  extras_paid_text: string | null;
  total_text: string | null;
  branch_word: string | null;
  branch_word_plural: string | null;
  onboarding_fee: string;
  start_date: string;
  ip: string | null;
  accepted_at: string;
};

export const ACCEPTANCE_COLUMNS =
  "id, company_id, accepted_by_name, accepted_by_email, agreement_version, dpa_version, agreement_sha256, dpa_sha256, is_draft, customer_legal_name, organisation_type, company_number, customer_address, plan, billing_option, price_text, included_text, price_list_date, branches_ordered, branches_text, extra_users, extra_branches, extra_users_text, extras_billing, extras_paid_text, total_text, branch_word, branch_word_plural, onboarding_fee, start_date, ip, accepted_at";

export const needsAgreement = cache(async (companyId: string): Promise<boolean> => {
  const supabase = await createClient();
  const published = legalPublished();
  if (!published) {
    const co = await getCompanyRow(companyId);
    if (!co) return false;
    if (!agreementGateOn(false, Boolean((co as { agreement_required?: boolean }).agreement_required))) return false;
  }
  const { data, error } = await supabase
    .from("agreement_acceptances")
    .select("agreement_version, dpa_version, is_draft")
    .eq("company_id", companyId);
  if (error) return false;
  return !acceptanceCurrent(
    (data ?? []) as Array<{ agreement_version: string; dpa_version: string; is_draft: boolean }>,
    LEGAL_VERSIONS,
    published,
  );
});

/** The company's acceptances, newest first. Company Admin and founder only (RLS). */
export async function listAcceptances(companyId: string): Promise<AcceptanceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agreement_acceptances")
    .select(ACCEPTANCE_COLUMNS)
    .eq("company_id", companyId)
    .order("accepted_at", { ascending: false });
  return (data ?? []) as AcceptanceRow[];
}
