import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/founder/stat-card";
import { SignupsChart } from "@/components/founder/signups-chart";
import {
  computeSeatUsage,
  includedSeatsForTier,
  includedBranchesForTier,
  formatPence,
  isBillableSeat,
  EXTRA_SEAT_PENCE,
  EXTRA_BRANCH_PENCE,
} from "@/lib/billing/seats";
import { TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import { subscriptionMonthlyPence } from "@/lib/billing/monthly-total";
import { buildSignupSeries, londonMonthKey, tallyBy } from "@/lib/founder/stats";
import {
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
    { data: branchRows },
    { data: billingRows },
    { data: usageRows },
    { count: newTrialRequests },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, slug, tier, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("company_id, status, role"),
    // Operational branches only (kind = 'branch'); the office/team row is never billed.
    supabase.from("branches").select("company_id, kind"),
    supabase
      .from("company_billing")
      .select("company_id, subscription_status, current_period_end"),
    supabase
      .from("usage_monthly")
      .select("kind, month, event_count, units_sum")
      .eq("month", `${thisMonth}-01`),
    // A lead nobody has touched yet. Counted here so a waiting request is visible
    // on the console itself and not only in an email that can be missed.
    supabase
      .from("trial_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  const waitingTrialRequests = newTrialRequests ?? 0;

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
    if (p.company_id && p.status === "active" && isBillableSeat(p.role)) {
      activeUsers.set(p.company_id, (activeUsers.get(p.company_id) ?? 0) + 1);
    }
  }

  const list = companies ?? [];

  /* Committed MRR: base, extra seats AND EXTRA BRANCHES for companies with a live
     subscription. Branches were missing until 2026-08-14, so this tile reported £69.00 while
     Stripe was billing Acme £76.50 — the same omission as the customer billing page and the
     founder company page, in a third and fourth file. It is now the one shared rule, whose
     every component is a required field precisely so the next charge cannot be forgotten.
     This is the number Phil quotes to a bank or a grant panel; it has to be the real one. */
  const operationalBranches = new Map<string, number>();
  for (const b of (branchRows as { company_id: string; kind: string | null }[] | null) ?? []) {
    if (b.kind !== "branch") continue;
    operationalBranches.set(b.company_id, (operationalBranches.get(b.company_id) ?? 0) + 1);
  }

  let mrrPence = 0;
  for (const company of list) {
    if (!isSubscriptionTier(company.tier)) continue;
    const status = billingByCompany.get(company.id)?.subscription_status ?? null;
    if (!["active", "trialing", "past_due"].includes(status ?? "")) continue;
    const seats = computeSeatUsage(activeUsers.get(company.id) ?? 0, includedSeatsForTier(company.tier));
    mrrPence += subscriptionMonthlyPence({
      basePence: TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE],
      extraSeats: seats.extra,
      seatPence: EXTRA_SEAT_PENCE,
      extraBranches: Math.max(
        0,
        (operationalBranches.get(company.id) ?? 0) - includedBranchesForTier(company.tier),
      ),
      branchPence: EXTRA_BRANCH_PENCE,
    });
  }

  // Platform aggregates for the dashboard.
  const activeCompanies = list.filter((c) => c.status === "active");
  const tierCounts = tallyBy(list, (c) => c.tier, ["business", "pro", "black"]);
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
    const seats = computeSeatUsage(used, includedSeatsForTier(company.tier));
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
            href="/founder/companies"
          />
          <StatCard
            label="Committed MRR"
            value={`${formatPence(mrrPence)}/mo`}
            sub="Base, seats and branches on live subscriptions"
            href="/founder/revenue"
          />
          <StatCard
            label="Active users"
            value={totalActiveUsers}
            sub={`${totalExtraSeats} billable extra seats`}
            href="/founder/revenue"
          />
          <StatCard
            label={`Usage, ${thisMonthLabel}`}
            value={`${smsUnits.toLocaleString("en-GB")} SMS`}
            sub={`${aiUnits.toLocaleString("en-GB")} AI units`}
            href="/founder/usage"
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

      <section aria-label="Library" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/founder/new" className="app-tile">
          <h2 className="text-base font-semibold text-white">Create a company</h2>
          <p className="text-sm text-white/60">Set up and seed a new tenant.</p>
        </Link>
        <Link href="/founder/forms" className="app-tile">
          <h2 className="text-base font-semibold text-white">Form template library</h2>
          <p className="text-sm text-white/60">Starter forms for new companies.</p>
        </Link>
        <Link href="/founder/question-bank" className="app-tile">
          <h2 className="text-base font-semibold text-white">Question bank</h2>
          <p className="text-sm text-white/60">Reusable questions for the builder.</p>
        </Link>
        <Link href="/founder/usage" className="app-tile">
          <h2 className="text-base font-semibold text-white">Usage</h2>
          <p className="text-sm text-white/60">Metered SMS and AI per company.</p>
        </Link>
        <Link href="/founder/audit" className="app-tile">
          <h2 className="text-base font-semibold text-white">Audit console</h2>
          <p className="text-sm text-white/60">Every change across every company.</p>
        </Link>
        <Link href="/founder/revenue" className="app-tile">
          <h2 className="text-base font-semibold text-white">Revenue</h2>
          <p className="text-sm text-white/60">MRR and billing.</p>
        </Link>
        <Link href="/founder/training-templates" className="app-tile">
          <h2 className="text-base font-semibold text-white">Training templates</h2>
          <p className="text-sm text-white/60">Master training course catalogue.</p>
        </Link>
        <Link href="/founder/health" className="app-tile">
          <h2 className="text-base font-semibold text-white">Platform health</h2>
          <p className="text-sm text-white/60">Dependencies, sends and webhooks.</p>
        </Link>
        <Link
          href="/founder/trial-requests"
          className="app-tile sm:col-span-2 lg:col-span-4"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold text-white">Trial requests</h2>
            {waitingTrialRequests > 0 ? (
              <span className="pill pill-amber">{waitingTrialRequests} new</span>
            ) : null}
          </div>
          <p className="text-sm text-white/60">
            {waitingTrialRequests > 0
              ? `${waitingTrialRequests} ${waitingTrialRequests === 1 ? "request is" : "requests are"} waiting for a reply. Setup stays founder led, so nothing is provisioned automatically.`
              : "Leads from the Start free trial form on the website. Nothing waiting."}
          </p>
        </Link>
        <Link
          href="/founder/companies"
          className="app-tile sm:col-span-2 lg:col-span-4"
        >
          <h2 className="text-base font-semibold text-white">Companies</h2>
          <p className="text-sm text-white/60">
            {list.length} {list.length === 1 ? "company" : "companies"} ·{" "}
            {formatPence(mrrPence)}/mo committed. Tiers, seats, billing and usage.
          </p>
        </Link>
      </section>
    </div>
  );
}
