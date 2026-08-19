import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { CompanyStatusButton } from "@/components/founder/company-status-button";
import {
  computeSeatUsage,
  includedSeatsForTier,
  includedBranchesForTier,
  EXTRA_BRANCH_PENCE,
  EXTRA_SEAT_PENCE,
  formatPence,
  isBillableSeat,
} from "@/lib/billing/seats";
import { subscriptionMonthlyPence } from "@/lib/billing/monthly-total";
import { TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import {
  billingStatusPill,
  companyStatusPillClass as statusPillClass,
  tierLabel,
} from "@/lib/founder/format";

export const metadata: Metadata = { title: "Companies" };

/** Is money actually moving? Mirrors the MRR tile on the founder console, which has always
 *  counted only these three states. */
function isLiveSubscription(status: string | null): boolean {
  return ["active", "trialing", "past_due"].includes(status ?? "");
}

export default async function FounderCompaniesPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [
    { data: companies },
    { data: profiles },
    { data: invites },
    { data: billingRows },
    { data: branchRows },
  ] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, slug, tier, status, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("company_id, status, role"),
      supabase.from("invites").select("company_id, status"),
      supabase.from("company_billing").select("company_id, subscription_status"),
      supabase.from("branches").select("company_id, kind"),
    ]);

  const billingByCompany = new Map(
    (billingRows ?? []).map((b) => [b.company_id, b]),
  );

  const activeUsers = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.company_id && p.status === "active" && isBillableSeat(p.role)) {
      activeUsers.set(p.company_id, (activeUsers.get(p.company_id) ?? 0) + 1);
    }
  }
  const pendingInvites = new Map<string, number>();
  for (const i of invites ?? []) {
    if (i.company_id && i.status === "pending") {
      pendingInvites.set(i.company_id, (pendingInvites.get(i.company_id) ?? 0) + 1);
    }
  }
  // OPERATIONAL branches only (kind === "branch"): the office row is not a branch and is
  // never billed. Same filter as the company drill-in page.
  const operationalBranches = new Map<string, number>();
  for (const b of branchRows ?? []) {
    if (b.company_id && (b as { kind?: string }).kind === "branch") {
      operationalBranches.set(b.company_id, (operationalBranches.get(b.company_id) ?? 0) + 1);
    }
  }
  const extraBranchesFor = (companyId: string, tier: string) =>
    Math.max(0, (operationalBranches.get(companyId) ?? 0) - includedBranchesForTier(tier));

  const list = companies ?? [];

  let mrrPence = 0;
  for (const company of list) {
    if (!isSubscriptionTier(company.tier)) continue;
    const status = billingByCompany.get(company.id)?.subscription_status ?? null;
    if (!["active", "trialing", "past_due"].includes(status ?? "")) continue;
    const seats = computeSeatUsage(activeUsers.get(company.id) ?? 0, includedSeatsForTier(company.tier));
    // The shared rule, so this header can never disagree with the console tile, the
    // revenue page or Stripe again. Branches are REQUIRED input, not an afterthought.
    mrrPence += subscriptionMonthlyPence({
      basePence: TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE],
      extraSeats: seats.extra,
      seatPence: EXTRA_SEAT_PENCE,
      extraBranches: extraBranchesFor(company.id, company.tier),
      branchPence: EXTRA_BRANCH_PENCE,
    });
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Companies</h1>
        <p className="page-subtitle">
          Every company on the platform: tier, status, seats, billing and usage.
          Click a company to drill in.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white/80">
          Companies ({list.length})
        </h2>
        <span className="text-xs text-white/60">
          Committed monthly revenue:{" "}
          <span className="font-semibold text-white/90">
            {formatPence(mrrPence)}/mo
          </span>
        </span>
      </div>

      {list.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            No companies yet. Use Create a company from the Founder console.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((company) => {
            const seats = computeSeatUsage(activeUsers.get(company.id) ?? 0, includedSeatsForTier(company.tier));
            const pending = pendingInvites.get(company.id) ?? 0;
            const isSub = isSubscriptionTier(company.tier);
            const bill = billingByCompany.get(company.id) ?? null;
            const bpill = billingStatusPill(bill?.subscription_status ?? null);
            const extraBranches = extraBranchesFor(company.id, company.tier);
            const monthlyTotalPence = isSub
              ? subscriptionMonthlyPence({
                  basePence: TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE],
                  extraSeats: seats.extra,
                  seatPence: EXTRA_SEAT_PENCE,
                  extraBranches,
                  branchPence: EXTRA_BRANCH_PENCE,
                })
              : 0;
            return (
              <div key={company.id} className="glass-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/founder/companies/${company.id}`}
                        className="truncate text-base font-semibold text-white hover:text-gold-300"
                      >
                        {company.name}
                      </Link>
                      <span className={statusPillClass(company.status)}>
                        {company.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-white/50">
                      {tierLabel(company.tier)} tier · {company.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Restore and Purge live on the company's own page, where the deletion is
                        explained. Nothing here applies to a company that has been deleted. */}
                    {company.status !== "deleted" ? (
                      <>
                        {company.status !== "active" ? (
                          <CompanyStatusButton companyId={company.id} status="active" label="Activate" />
                        ) : null}
                        {company.status !== "suspended" && company.status !== "archived" ? (
                          <CompanyStatusButton companyId={company.id} status="suspended" label="Suspend" />
                        ) : null}
                        {company.status !== "archived" ? (
                          <CompanyStatusButton companyId={company.id} status="archived" label="Archive" />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/60">
                  <span>
                    Seats: <span className="text-white/90">{seats.used}</span> used
                    of {seats.included} included
                  </span>
                  <span>
                    Extra billable:{" "}
                    <span className="text-white/90">{seats.extra}</span> (
                    {formatPence(seats.extraCostPence)}/mo)
                  </span>
                  <span>
                    Extra branches:{" "}
                    <span className="text-white/90">{extraBranches}</span> (
                    {formatPence(extraBranches * EXTRA_BRANCH_PENCE)}/mo)
                  </span>
                  <span>
                    Pending invites: <span className="text-white/90">{pending}</span>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-white/10 pt-2 text-xs text-white/60">
                  {isSub ? (
                    <>
                      <span className={`pill ${bpill.cls}`}>{bpill.text}</span>
                      {/*
                        WHAT THEY ARE CHARGED, NOT WHAT THE TIER COSTS. A deleted company printed
                        "Cancelled · Monthly: £76.50/mo" next to a red deleted pill on 2026-08-19,
                        while the page total correctly read £0.00/mo — the same number contradicting
                        itself on one screen. With no live subscription there is no monthly charge,
                        and the tier's price is a quote, not a fact about this company.
                      */}
                      {isLiveSubscription(bill?.subscription_status ?? null) ? (
                        <span>
                          Monthly:{" "}
                          <span className="text-white/90">
                            {formatPence(monthlyTotalPence)}/mo
                          </span>
                        </span>
                      ) : (
                        <span>
                          Monthly:{" "}
                          <span className="text-white/90">
                            nothing charged
                          </span>
                          <span className="text-white/40">
                            {" "}
                            ({formatPence(monthlyTotalPence)}/mo if they subscribe)
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <span>
                      Billing:{" "}
                      <span className="text-white/90">
                        {company.tier === "black"
                          ? "free, founder granted"
                          : "not a subscription"}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
