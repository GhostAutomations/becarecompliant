import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { CompanyStatusButton } from "@/components/founder/company-status-button";
import { computeSeatUsage, formatPence } from "@/lib/billing/seats";
import { TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import {
  billingStatusPill,
  companyStatusPillClass as statusPillClass,
  tierLabel,
} from "@/lib/founder/format";

export const metadata: Metadata = { title: "Companies" };

export default async function FounderCompaniesPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: companies }, { data: profiles }, { data: invites }, { data: billingRows }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, slug, tier, status, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("company_id, status, role"),
      supabase.from("invites").select("company_id, status"),
      supabase.from("company_billing").select("company_id, subscription_status"),
    ]);

  const billingByCompany = new Map(
    (billingRows ?? []).map((b) => [b.company_id, b]),
  );

  const activeUsers = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.company_id && p.status === "active" && p.role !== "platform_admin") {
      activeUsers.set(p.company_id, (activeUsers.get(p.company_id) ?? 0) + 1);
    }
  }
  const pendingInvites = new Map<string, number>();
  for (const i of invites ?? []) {
    if (i.company_id && i.status === "pending") {
      pendingInvites.set(i.company_id, (pendingInvites.get(i.company_id) ?? 0) + 1);
    }
  }

  const list = companies ?? [];

  let mrrPence = 0;
  for (const company of list) {
    if (!isSubscriptionTier(company.tier)) continue;
    const status = billingByCompany.get(company.id)?.subscription_status ?? null;
    if (!["active", "trialing", "past_due"].includes(status ?? "")) continue;
    const seats = computeSeatUsage(activeUsers.get(company.id) ?? 0);
    mrrPence +=
      TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE] +
      seats.extraCostPence;
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
            const seats = computeSeatUsage(activeUsers.get(company.id) ?? 0);
            const pending = pendingInvites.get(company.id) ?? 0;
            const isSub = isSubscriptionTier(company.tier);
            const bill = billingByCompany.get(company.id) ?? null;
            const bpill = billingStatusPill(bill?.subscription_status ?? null);
            const monthlyTotalPence = isSub
              ? TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE] +
                seats.extraCostPence
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
                    {company.status !== "active" ? (
                      <CompanyStatusButton companyId={company.id} status="active" label="Activate" />
                    ) : null}
                    {company.status !== "suspended" && company.status !== "archived" ? (
                      <CompanyStatusButton companyId={company.id} status="suspended" label="Suspend" />
                    ) : null}
                    {company.status !== "archived" ? (
                      <CompanyStatusButton companyId={company.id} status="archived" label="Archive" />
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
                    Pending invites: <span className="text-white/90">{pending}</span>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-white/10 pt-2 text-xs text-white/60">
                  {isSub ? (
                    <>
                      <span className={`pill ${bpill.cls}`}>{bpill.text}</span>
                      <span>
                        Monthly:{" "}
                        <span className="text-white/90">
                          {formatPence(monthlyTotalPence)}/mo
                        </span>
                      </span>
                    </>
                  ) : (
                    <span>
                      Billing:{" "}
                      <span className="text-white/90">
                        {company.tier === "diamond"
                          ? "usage only"
                          : company.tier === "black"
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
