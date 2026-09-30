"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { legalDocuments, legalPublished, LEGAL_VERSIONS } from "@/lib/legal/documents";
import { loadOrderTerms } from "@/lib/legal/order-terms";
import { acceptanceCurrent, afterAcceptPath, billingApplies, branchesLineText, checkOrder, isLiveSubscription, extrasLineText, extrasPaidText, orderCosts, orderExtrasText, orderPriceListText, onboardingFeeLabel, orderIncludedText, orderPriceText, planLabel } from "@/lib/legal/fill";
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
  /* A FOUNDER DEAL FIXES THE ORDER (0354): its choices are used whatever the form sends. */
  const terms = await loadOrderTerms(supabase, companyId);
  const fixed = billed ? terms.fixed : null;
  const input = {
    legalName: String(formData.get("legal_name") ?? ""),
    organisationType: String(formData.get("organisation_type") ?? ""),
    companyNumber: String(formData.get("company_number") ?? ""),
    address: String(formData.get("address") ?? ""),
    billingOption: billed ? (fixed?.billingOption ?? String(formData.get("billing_option") ?? "")) : "none",
    accepted: formData.get("accept") === "yes",
    // A Black account is not asked about extras: it has as many users and branches as it needs.
    extraUsers: billed ? (fixed ? String(fixed.extraUsers) : String(formData.get("extra_users") ?? "")) : undefined,
    extraBranches: billed ? (fixed ? String(fixed.extraBranches) : String(formData.get("extra_branches") ?? "")) : undefined,
    extrasBilling: billed ? (fixed?.extrasBilling ?? String(formData.get("extras_billing") ?? "yearly")) : undefined,
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

  /* The extras and what they cost, worked out here from the plan, never taken from the form's
     own sums (Phil, 2026-09-30): the form only says how many. */
  const extraUsers = billed ? Number(input.extraUsers) : 0;
  const extraBranches = billed ? Number(input.extraBranches) : 0;
  const costs = orderCosts({
    tier: company.tier,
    plan: planLabel(company.tier),
    billingOption: input.billingOption,
    extrasBilling: input.extrasBilling ?? "yearly",
    monthlyPence: terms.monthlyPence,
    annualMonths: ANNUAL_MONTHS_CHARGED,
    extraUsers,
    extraBranches,
    seatPence: terms.seatPence,
    branchPence: terms.branchPence,
    onboardingFee: terms.onboardingFee,
    branchStep: terms.step,
    word: terms.word,
  });

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
      monthlyPence: terms.monthlyPence,
      annualMonths: ANNUAL_MONTHS_CHARGED,
    }),
    included_text: terms.includedText,
    price_list_date: terms.priceListText,
    onboarding_fee: terms.onboardingFee,
    branches_ordered: billed ? includedBranchesForTier(company.tier ?? "business") + extraBranches : null,
    branches_text: branchesLineText(extraBranches, terms.branchPence, company.tier, terms.step),
    extra_users: billed ? extraUsers : null,
    extra_branches: billed ? extraBranches : null,
    extra_users_text: extrasLineText(extraUsers, terms.seatPence, company.tier),
    extras_billing: costs.extrasBilling,
    extras_paid_text: extrasPaidText(costs, input.billingOption, company.tier),
    total_text: costs.totalText,
    // Their word for a branch as it read on the Order they accepted (0355). Null means Branch.
    branch_word: terms.word.one.toLowerCase() === "branch" ? null : terms.word.one,
    branch_word_plural: terms.word.one.toLowerCase() === "branch" ? null : terms.word.many,
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
