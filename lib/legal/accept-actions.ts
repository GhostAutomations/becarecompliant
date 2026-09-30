"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { legalDocuments, legalPublished, LEGAL_VERSIONS } from "@/lib/legal/documents";
import { acceptanceCurrent, afterAcceptPath, billingApplies, checkOrder, isLiveSubscription, orderExtrasText, orderPriceListText, onboardingFeeLabel, orderIncludedText, orderPriceText, planLabel } from "@/lib/legal/fill";
import { TIER_BASE_PENCE } from "@/lib/stripe/config";
import { EXTRA_BRANCH_PENCE, EXTRA_SEAT_PENCE, includedBranchesForTier, includedSeatsForTier } from "@/lib/billing/seats";
import { getCompanyBilling } from "@/lib/billing/stripe-sync";
import { ANNUAL_MONTHS_CHARGED, PRICE_LIST_DATE, aiMonthlyCredits, smsMonthlyCredits } from "@/lib/billing/allowances";
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

  const supabase = await createClient();
  const { data: co, error: coErr } = await supabase
    .from("companies")
    .select("tier, agreement_required")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !co) return { error: "Your company could not be read. Please try again." };
  const company = co as { tier: string | null; agreement_required: boolean | null };

  /* A Black account is never billed, so it is not asked Monthly or Annual (Phil, 2026-09-30):
     whatever the form sends, it is recorded as "none". Decided here from the plan, not the form. */
  const billed = billingApplies(company.tier);
  const input = {
    legalName: String(formData.get("legal_name") ?? ""),
    organisationType: String(formData.get("organisation_type") ?? ""),
    companyNumber: String(formData.get("company_number") ?? ""),
    address: String(formData.get("address") ?? ""),
    billingOption: billed ? String(formData.get("billing_option") ?? "") : "none",
    accepted: formData.get("accept") === "yes",
  };
  const problems = checkOrder(input, { billingApplies: billed });
  const first = Object.values(problems)[0];
  if (first) return { error: first };

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
    redirect(await nextAfterAccept(companyId, company.tier));
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
    price_text: orderPriceText({
      tier: company.tier,
      billingOption: input.billingOption,
      monthlyPence:
        company.tier === "business" || company.tier === "pro" ? TIER_BASE_PENCE[company.tier] : null,
      annualMonths: ANNUAL_MONTHS_CHARGED,
    }),
    included_text: orderIncludedText({
      users: includedSeatsForTier(company.tier ?? "business"),
      branches: includedBranchesForTier(company.tier ?? "business"),
      ai: aiMonthlyCredits(company.tier),
      sms: smsMonthlyCredits(company.tier),
    }),
    price_list_date: orderPriceListText(
      orderExtrasText({ tier: company.tier, seatPence: EXTRA_SEAT_PENCE, branchPence: EXTRA_BRANCH_PENCE }),
      PRICE_LIST_DATE,
    ),
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

  /* ON TO THE NEXT STEP, FROM THE SERVER (A5, 2026-09-30; the payment step came the same day). Returning redirectTo left the
     Admin on "Your agreement": revalidatePath re-renders /agreement in the same response, and
     with nothing left to accept it renders the record instead of the form, so the form (and its
     client side redirect) is gone before it can run. redirect() is safe here: the Next 15 bug
     lib/forms.ts avoids only bites a URL with a query string, and /dashboard has none. */
  revalidatePath("/", "layout");
  redirect(await nextAfterAccept(companyId, company.tier));
}

/** The payment step for a company that has to pay and is not paying yet, else the dashboard. */
async function nextAfterAccept(companyId: string, tier: string | null): Promise<string> {
  const billing = await getCompanyBilling(companyId);
  return afterAcceptPath({
    tier,
    liveSubscription: isLiveSubscription(billing?.subscription_status, billing?.stripe_subscription_id),
  });
}
