import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCompanyTrialState } from "@/lib/billing/trial-gate";
import { needsAgreement, listAcceptances, type AcceptanceRow } from "@/lib/legal/acceptance";
import { legalDocuments, legalPublished, LEGAL_VERSIONS } from "@/lib/legal/documents";
import { loadOrderTerms } from "@/lib/legal/order-terms";
import { branchWord } from "@/lib/billing/deal";
import { acceptanceCurrent, billingApplies, billingOptionLabel, fillOrderTable, orderExtrasText, orderIncludedList, orderPriceListText, orderTableValues, organisationLabel, planLabel, onboardingFeeLabel, orderIncludedText, orderPriceText } from "@/lib/legal/fill";
import { TIER_BASE_PENCE } from "@/lib/stripe/config";
import { EXTRA_BRANCH_PENCE, EXTRA_SEAT_PENCE, includedBranchesForTier, includedSeatsForTier } from "@/lib/billing/seats";
import { ANNUAL_MONTHS_CHARGED, PRICE_LIST_DATE, aiMonthlyCredits, smsMonthlyCredits } from "@/lib/billing/allowances";
import { ONBOARDING_FEE, ONBOARDING_OFFER_END_TEXT, onboardingOfferActive } from "@/lib/marketing/offer";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { ukDate } from "@/lib/dates";
import AcceptOrderForm from "@/components/legal/accept-order-form";
import LegalDocumentView from "@/components/legal/legal-document-view";
import { lower } from "@/lib/branches/word";

/**
 * The agreement, for a Company Admin (0346).
 *
 * TWO JOBS. Until the company has accepted what is in force, requireCompany sends its Company Admin
 * here from every page, and this is the accept screen: the Order prefilled from what we already
 * hold, both documents to read, one tick and Accept. Once accepted, it is where they come back to
 * see what was accepted, by whom and when (linked from Settings, Billing).
 *
 * OUTSIDE (app) on purpose, like Trial ended: inside it every nav link would bounce straight back
 * here, which reads as a broken app. requireProfile, not requireCompany, or it would redirect to
 * itself. Other roles never need it and are sent to their home.
 */

export const metadata: Metadata = { title: "Your agreement" };

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

function OrderTable({ a }: { a: AcceptanceRow }) {
  const rows: Array<[string, string]> = [
    ["Customer legal name", a.customer_legal_name],
    ["Type of organisation", organisationLabel(a.organisation_type)],
    ["Company or charity number", a.company_number ?? "None given"],
    ["Registered or main address", a.customer_address],
    ["Plan", a.plan],
    ["Price", a.price_text ?? "Not recorded"],
    ["Included", a.included_text ?? "Not recorded"],
    ["Extra users", a.extra_users_text ?? "Not recorded"],
    [`Extra ${lower(branchWord(a).many)}`, a.branches_text ?? "Not recorded"],
    ["Extras paid", a.extras_paid_text ?? "Not recorded"],
    ["Total", a.total_text ?? "Not recorded"],
    ["Billing option", billingOptionLabel(a.billing_option)],
    ["Extras and prices", a.price_list_date ?? "Not recorded"],
    ["Onboarding fee", a.onboarding_fee],
    ["Start date", ukDate(a.start_date)],
    ["Accepted by", `${a.accepted_by_name}, Company Admin`],
    ["Accepted on", `${dateTime(a.accepted_at)}${a.ip ? `, from ${a.ip}` : ""}`],
    ["Versions accepted", `Subscription Agreement ${a.agreement_version}, Data Processing Agreement ${a.dpa_version}`],
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-left text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-white/5 last:border-0">
              <td className="w-48 px-3 py-2 align-top font-medium text-white/90">{k}</td>
              <td className="px-3 py-2 align-top text-white/75">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AgreementPage() {
  const { profile } = await requireProfile();
  if (profile.role === "platform_admin") redirect("/founder");
  if (!profile.company_id) redirect("/login?reason=no-access");
  if (profile.role !== "company_admin") redirect("/dashboard");

  const trial = await getCompanyTrialState(profile.company_id);
  if (trial.companyStatus !== "active") redirect("/company-closed");
  if (trial.status === "expired") redirect("/trial-ended");

  const companyId = profile.company_id;
  const docs = legalDocuments();
  const published = legalPublished();
  const [needs, acceptances] = await Promise.all([needsAgreement(companyId), listAcceptances(companyId)]);
  const current = acceptances.find((a) =>
    acceptanceCurrent([a], LEGAL_VERSIONS, published),
  );

  const docLinks = (
    <p className="text-xs text-white/55">
      Read them in full:{" "}
      <Link href="/terms" target="_blank" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
        Subscription Agreement
      </Link>{" "}
      and{" "}
      <Link href="/dpa" target="_blank" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
        Data Processing Agreement
      </Link>
      .
    </p>
  );

  /* ---------------- Already accepted, or nothing to accept yet: the record ---------------- */
  if (!needs) {
    return (
      <main className="app-bg min-h-dvh px-4 py-10">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <div className="glass-card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-white">Your agreement</h1>
            {current ? (
              <>
                <p className="mt-2 text-sm text-white/70">
                  {trial.companyName} accepted the Subscription Agreement {current.agreement_version} and the
                  Data Processing Agreement {current.dpa_version}.
                  {current.is_draft ? " This was a test of the draft, before the final text was published." : ""}
                </p>
                <div className="mt-5">
                  <OrderTable a={current} />
                </div>
                <details className="mt-5 rounded-lg border border-white/10 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    The Subscription Agreement you accepted, with your Order filled in
                  </summary>
                  <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] p-4">
                    <LegalDocumentView
                      compact
                      text={fillOrderTable(
                        docs.agreement.text,
                        orderTableValues({
                          legalName: current.customer_legal_name,
                          organisationType: current.organisation_type,
                          companyNumber: current.company_number ?? "",
                          address: current.customer_address,
                          plan: current.plan,
                          price: current.price_text ?? "Not recorded",
                          included: current.included_text ?? "Not recorded",
                          extraUsers: current.extra_users_text ?? "Not recorded",
                          extraBranches: current.branches_text ?? "Not recorded",
                          extrasPaid: current.extras_paid_text ?? "Not recorded",
                          total: current.total_text ?? "Not recorded",
                          billingOption: current.billing_option,
                          priceList: current.price_list_date ?? "Not recorded",
                          onboardingFee: current.onboarding_fee,
                          startDate: ukDate(current.start_date),
                          acceptedBy: current.accepted_by_name,
                          acceptedOn: `${dateTime(current.accepted_at)}${current.ip ? `, from ${current.ip}` : ""}`,
                          agreementVersion: current.agreement_version,
                          dpaVersion: current.dpa_version,
                        }),
                        { word: branchWord({ branch_word: current.branch_word, branch_word_plural: current.branch_word_plural }) },
                      )}
                    />
                  </div>
                </details>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/70">
                There is nothing for you to accept yet. The agreement is still being finalised, and you will be
                asked to accept it here when it is published.
              </p>
            )}
            <div className="mt-5">{docLinks}</div>
            <div className="mt-6">
              <Link href="/settings/billing" className="btn-ghost px-3 py-2 text-xs">
                Back to Billing
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ---------------- The accept screen ---------------- */
  const supabase = await createClient();
  const [{ data: co }, { data: inv }, { data: office }] = await Promise.all([
    supabase.from("companies").select("name, tier").eq("id", companyId).maybeSingle(),
    supabase.from("invoicing_config").select("company_number, from_address").eq("company_id", companyId).maybeSingle(),
    supabase.from("branches").select("address").eq("company_id", companyId).eq("kind", "office").maybeSingle(),
  ]);
  const company = (co ?? { name: trial.companyName, tier: trial.tier }) as { name: string | null; tier: string | null };
  const invoicing = (inv ?? null) as { company_number: string | null; from_address: string | null } | null;
  const officeAddress = ((office ?? null) as { address: string | null } | null)?.address ?? "";
  const today = formatCivilDate(todayInLondon());
  const renewal = acceptances.length > 0;
  /* The Order's terms, deal and all (0354): the same loader the server uses when it records the
     acceptance, so what is shown is what is signed. */
  const terms = await loadOrderTerms(supabase, companyId);
  const monthlyPence = terms.monthlyPence;
  const priceMonthly = orderPriceText({ tier: company.tier, billingOption: "monthly", monthlyPence, annualMonths: ANNUAL_MONTHS_CHARGED });
  const priceAnnual = orderPriceText({ tier: company.tier, billingOption: "annual", monthlyPence, annualMonths: ANNUAL_MONTHS_CHARGED });
  const allowance = terms.allowance;

  return (
    <main className="app-bg min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="glass-card p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-white">
            {renewal ? "Our agreement has been updated" : "Before you start: your agreement with us"}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {renewal
              ? "We have published a new version of our agreement. Please read it and accept it for your company. Until you do, the version you last accepted still applies and the rest of your team carries on as normal."
              : `Please check your company details and accept the Subscription Agreement and the Data Processing Agreement for ${company.name ?? trial.companyName}. Only you are asked; the rest of your team carries on as normal.`}
          </p>
          {!published ? (
            <p className="mt-3 rounded-lg border border-gold-400/40 bg-gold-400/10 p-3 text-xs text-white/80">
              <span className="font-semibold text-gold-300">Draft.</span> This is a test of the draft agreement.
              Accepting it now is recorded as a test and you will be asked again when the final text is published.
            </p>
          ) : null}
        </div>

        <AcceptOrderForm
          billingApplies={billingApplies(company.tier)}
          initial={{
            legalName: company.name ?? "",
            companyNumber: invoicing?.company_number ?? "",
            address: invoicing?.from_address || officeAddress,
          }}
          summary={{
            plan: planLabel(company.tier),
            tier: company.tier ?? "business",
            includedList: terms.includedList,
            usersIncluded: allowance.users,
            branchesIncluded: allowance.branches,
            seatPence: terms.seatPence,
            branchPence: terms.branchPence,
            branchStep: terms.step,
            word: terms.word,
            fixed: terms.fixed,
            monthlyPence,
            annualMonths: ANNUAL_MONTHS_CHARGED,
            priceMonthly,
            priceAnnual,
            included: terms.includedText,
            priceList: terms.priceListText,
            extras: terms.extrasText,
            onboardingFee: terms.onboardingFee,
            startDate: ukDate(today),
            adminName: profile.full_name || profile.email || "Company Admin",
            agreementVersion: docs.agreement.version,
            dpaVersion: docs.dpa.version,
          }}
          agreementText={docs.agreement.text}
          dpaText={docs.dpa.text}
          published={published}
          docLinks={docLinks}
        />

        <div className="flex justify-end">
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-ghost px-3 py-2 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
