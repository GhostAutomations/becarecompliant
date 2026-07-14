import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { CreateCompanyForm } from "@/components/founder/create-company-form";
import { CompanyStatusButton } from "@/components/founder/company-status-button";
import { StatCard } from "@/components/founder/stat-card";
import { SignupsChart } from "@/components/founder/signups-chart";
import { computeSeatUsage, formatPence } from "@/lib/billing/seats";
import { TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import { buildSignupSeries, londonMonthKey, tallyBy } from "@/lib/founder/stats";
import {
  billingStatusPill,
  companyStatusPillClass as statusPillClass,
  tierLabel,
} from "@/lib/founder/format";

export const metadata: Metadata = { title: "Founder" };

export default async function FounderPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const thisMonth = londonMonthKey(new Date());

  const [
    { data: companies },
    { data: profiles },
    { data: invites },
    { data: billingRows },
    { data: usageRows },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, slug, tier, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("company_id, status, role"),
    supabase.from("invites").select("company_id, status"),
    supabase
      .from("company_billing")
      .select("company_id, subscription_status, current_period_end"),
    supabase
      .from("usage_monthly")
      .select("kind, month, event_count, units_sum")
      .eq("month", `${thisMonth}-01`),
  ]);

  const billingByCompany = new Map<
    string,
    { subscription_status: string | null; current_period_end: string | null }
  >();
  for (const b of billingRows ?? []) {
    billingByCompany.set(b.company_id, {
      subscription_status: b.subscription_status,
      current_period_end: b.current_period_end,
    });
  }

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

  // Committed MRR: base + extra seats for companies with a live subscription.
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

  // Platform aggregates for the dashboard.
  const activeCompanies = list.filter((c) => c.status === "active");
  const tierCounts = tallyBy(list, (c) => c.tier, [
    "business",
    "pro",
    "enterprise",
    "diamond",
    "black",
  ]);
  const statusCounts = tallyBy(list, (c) => c.status, [
    "active",
    "suspended",
    "archived",
  ]);

  let totalActiveUsers = 0;
  let totalExtraSeats = 0;
  for (const company of list) {
    if (company.status === "archived") continue;
    const used = activeUsers.get(company.id) ?? 0;
    const seats = computeSeatUsage(used);
    totalActiveUsers += used;
    totalExtraSeats += seats.extra;
  }

  // SMS + AI usage this month (across all companies).
  let smsUnits = 0;
  let aiUnits = 0;
  for (const u of usageRows ?? []) {
    if (u.kind === "sms") smsUnits += u.units_sum ?? 0;
    else if (u.kind === "ai") aiUnits += u.units_sum ?? 0;
  }

  const signupSeries = buildSignupSeries(list, 8);
  const thisMonthLabel = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="page-title">Founder console</h1>
        <p className="page-subtitle">
          Create and manage companies. Company setup is founder led: you create
          the company, set the tier and invite the first Admin.
        </p>
      </div>

      <section aria-label="Platform statistics" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Companies"
            value={list.length}
            sub={`${activeCompanies.length} active`}
          />
          <StatCard
            label="Committed MRR"
            value={`${formatPence(mrrPence)}/mo`}
            sub="Base + seats on live subscriptions"
          />
          <StatCard
            label="Active users"
            value={totalActiveUsers}
            sub={`${totalExtraSeats} billable extra seats`}
          />
          <StatCard
            label={`Usage, ${thisMonthLabel}`}
            value={`${smsUnits.toLocaleString("en-GB")} SMS`}
            sub={`${aiUnits.toLocaleString("en-GB")} AI units`}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-white/80">
              Companies by tier
            </h3>
            <div className="space-y-2">
              {tierCounts.map((t) => (
                <div
                  key={t.key}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-white/70">{tierLabel(t.key)}</span>
                  <span className="font-semibold text-white/90">{t.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              {statusCounts.map((s) => (
                <span
                  key={s.key}
                  className={`pill ${statusPillClass(s.key)}`}
                >
                  {s.count} {s.key}
                </span>
              ))}
            </div>
          </div>
          <SignupsChart data={signupSeries} />
        </div>
      </section>

      <section aria-label="Library" className="grid gap-4 sm:grid-cols-2">
        <Link href="/founder/forms" className="app-tile">
          <h2 className="text-base font-semibold text-white">Form template library</h2>
          <p className="text-sm text-white/60">
            Curate the master starter forms that seed every new company, using the same
            builder.
          </p>
        </Link>
        <Link href="/founder/question-bank" className="app-tile">
          <h2 className="text-base font-semibold text-white">Question bank</h2>
          <p className="text-sm text-white/60">
            Curate reusable questions authors can drop into any form from the builder.
          </p>
        </Link>
        <Link href="/founder/usage" className="app-tile">
          <h2 className="text-base font-semibold text-white">Usage</h2>
          <p className="text-sm text-white/60">
            Metered SMS and AI usage per company, this month and by month. Diamond
            billing reads from this.
          </p>
        </Link>
        <Link href="/founder/audit" className="app-tile">
          <h2 className="text-base font-semibold text-white">Audit console</h2>
          <p className="text-sm text-white/60">
            Every change across every company, who made it and when. Filter and export
            for an inspector.
          </p>
        </Link>
        <Link href="/founder/revenue" className="app-tile">
          <h2 className="text-base font-semibold text-white">Revenue</h2>
          <p className="text-sm text-white/60">
            Committed MRR, per company billing state, Diamond usage to invoice and
            Black accounts.
          </p>
        </Link>
        <Link href="/founder/training-templates" className="app-tile">
          <h2 className="text-base font-semibold text-white">Training templates</h2>
          <p className="text-sm text-white/60">
            Curate the master training course catalogue that seeds every new
            company.
          </p>
        </Link>
        <Link href="/founder/health" className="app-tile">
          <h2 className="text-base font-semibold text-white">Platform health</h2>
          <p className="text-sm text-white/60">
            Dependencies, failed sends and webhook processing, without digging
            through logs.
          </p>
        </Link>
      </section>

      <section aria-label="Companies" className="space-y-3">
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
              No companies yet. Create the first one below.
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
                      Seats: <span className="text-white/90">{seats.used}</span>{" "}
                      used of {seats.included} included
                    </span>
                    <span>
                      Extra billable:{" "}
                      <span className="text-white/90">{seats.extra}</span> (
                      {formatPence(seats.extraCostPence)}/mo)
                    </span>
                    <span>
                      Pending invites:{" "}
                      <span className="text-white/90">{pending}</span>
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
      </section>

      <section aria-label="Create a company" className="glass-card p-6">
        <h2 className="mb-1 text-base font-semibold text-white">
          Create a company
        </h2>
        <p className="mb-5 text-sm text-white/60">
          Seeds one Team (office) and one Branch. Additional branches are a paid
          add on, added later.
        </p>
        <CreateCompanyForm />
      </section>
    </div>
  );
}
