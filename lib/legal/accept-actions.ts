"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { legalDocuments, legalPublished, LEGAL_VERSIONS } from "@/lib/legal/documents";
import { acceptanceCurrent, checkOrder, onboardingFeeLabel, planLabel } from "@/lib/legal/fill";
import { ONBOARDING_FEE, ONBOARDING_OFFER_END_TEXT, onboardingOfferActive } from "@/lib/marketing/offer";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import type { ActionState } from "@/lib/forms";

/**
 * A Company Admin accepts the Subscription Agreement and the DPA (0346).
 *
 * WRITTEN BY THE SERVER, NOT THE BROWSER. The row goes in with the service role after this action
 * has checked the person, so the time, IP address and the fingerprint of the text are the
 * server's. Nobody signed in can insert into agreement_acceptances directly.
 *
 * SAFE TO PRESS TWICE. If the company has already accepted what is in force, nothing is written
 * again and the Admin is simply sent on.
 */
export async function acceptAgreement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany({ allowUnaccepted: true });
  // The founder managing a company is not that company's Admin and cannot bind it.
  if (profile.role !== "company_admin" || !profile.company_id) {
    return { error: "Only your Company Admin can accept the agreement for your company." };
  }
  const companyId = profile.company_id;

  const input = {
    legalName: String(formData.get("legal_name") ?? ""),
    organisationType: String(formData.get("organisation_type") ?? ""),
    companyNumber: String(formData.get("company_number") ?? ""),
    address: String(formData.get("address") ?? ""),
    billingOption: String(formData.get("billing_option") ?? ""),
    accepted: formData.get("accept") === "yes",
  };
  const problems = checkOrder(input);
  const first = Object.values(problems)[0];
  if (first) return { error: first };

  const supabase = await createClient();
  const { data: co, error: coErr } = await supabase
    .from("companies")
    .select("tier, agreement_required")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !co) return { error: "Your company could not be read. Please try again." };
  const company = co as { tier: string | null; agreement_required: boolean | null };

  const published = legalPublished();
  if (!published && !company.agreement_required) {
    return { error: "The agreement has not been published yet, so there is nothing to accept." };
  }

  const { data: existing } = await supabase
    .from("agreement_acceptances")
    .select("agreement_version, dpa_version, is_draft")
    .eq("company_id", companyId);
  if (
    acceptanceCurrent(
      (existing ?? []) as Array<{ agreement_version: string; dpa_version: string; is_draft: boolean }>,
      LEGAL_VERSIONS,
      published,
    )
  ) {
    return { ok: "Accepted", redirectTo: "/dashboard" };
  }

  const docs = legalDocuments();
  const today = formatCivilDate(todayInLondon());
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = (hdrs.get("user-agent") ?? "").slice(0, 400) || null;
  const num = input.companyNumber.trim();

  const row = {
    company_id: companyId,
    accepted_by: user.id,
    accepted_by_name: profile.full_name || profile.email,
    accepted_by_email: profile.email,
    agreement_version: docs.agreement.version,
    dpa_version: docs.dpa.version,
    agreement_sha256: docs.agreement.sha256,
    dpa_sha256: docs.dpa.sha256,
    is_draft: !published,
    customer_legal_name: input.legalName.trim(),
    organisation_type: input.organisationType,
    company_number: num === "" ? null : num,
    customer_address: input.address.trim(),
    plan: planLabel(company.tier),
    billing_option: input.billingOption,
    onboarding_fee: onboardingFeeLabel({
      tier: company.tier,
      offerActive: onboardingOfferActive(today),
      fee: ONBOARDING_FEE,
      offerEnd: ONBOARDING_OFFER_END_TEXT,
    }),
    start_date: today,
    ip,
    user_agent: userAgent,
  };

  const admin = createServiceClient();
  const { data: saved, error } = await admin.from("agreement_acceptances").insert(row).select("id").single();
  if (error || !saved) return { error: `Your acceptance could not be saved: ${error?.message ?? "no row"}. Please try again.` };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "agreement.accepted",
    entityType: "company",
    entityId: companyId,
    summary: `Accepted the Subscription Agreement ${docs.agreement.version} and Data Processing Agreement ${docs.dpa.version}${published ? "" : " (draft, test)"}`,
    metadata: {
      acceptance_id: (saved as { id: string }).id,
      billing_option: input.billingOption,
      is_draft: !published,
    },
  });

  revalidatePath("/", "layout");
  return { ok: "Accepted", redirectTo: "/dashboard" };
}
