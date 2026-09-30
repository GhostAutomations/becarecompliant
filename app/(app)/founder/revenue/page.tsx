import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { StatCard } from "@/components/founder/stat-card";
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
import { orderedExtrasByCompany, orderedFor } from "@/lib/billing/ordered-extras-read";
import { billedExtra } from "@/lib/billing/ordered-extras";
import { dealsByCompany } from "@/lib/billing/deal-store";
import { dealMonthlyParts } from "@/lib/billing/deal";
import { subscriptionMonthlyPence, monthlyRecurringPence } from "@/lib/billing/monthly-total";
import { YEARLY_MONTHS_CHARGED as MRR_YEARLY_MONTHS } from "@/lib/stripe/config";
import { billingStatusPill, tierLabel } from "@/lib/founder/format";

export const metadata: Metadata = { title: "Revenue" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default async function FounderRevenuePage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: companies }, { data: profiles }, { data: branchRows }, { data: billingRows }] =
    await Promise.all([
    supabase
      .from("companies")
      .select("id, name, tier, status, is_test")
      .not("status", "in", "(archived,deleted)")
      .order("name", { ascending: true }),
    supabase.from("profiles").select("company_id, status, role"),
    // Operational branches only (kind = 'branch'); the office/team row is never billed.
    supabase.from("branches").select("company_id, kind"),
    supabase
      .from("company_billing")
      .select(
        "company_id, subscription_status, billed_tier, seat_quantity, current_period_end, cancel_at_period_end, billing_interval, extras_interval",
      ),
  ]);

  const list = companies ?? [];
  const billingByCompany = new Map(
    (billingRows ?? []).map((b) => [b.company_id, b]),
  );

  const activeUsers = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.company_id && p.status === "active" && isBillableSeat(p.role)) {
      activeUsers.set(p.company_id, (activeUsers.get(p.company_id) ?? 0) + 1);
    }
  }

  const operationalBranches = new Map<string, number>();
  for (const b of (branchRows as { company_id: string; kind: string | null }[] | null) ?? []) {
    if (b.kind !== "branch") continue;
    operationalBranches.set(b.company_id, (operationalBranches.get(b.company_id) ?? 0) + 1);
  }

  type Row = {
    id: string;
    name: string;
    tier: string;
    status: string;
    billingStatus: string | null;
    monthlyPence: number;
    seatsUsed: number;
    seatsExtra: number;
    branchesExtra: number;
    periodEnd: string | null;
    cancelAtEnd: boolean;
  };

  const subs: Row[] = [];
  const blacks: Row[] = [];
  let mrrPence = 0;
  let pastDue = 0;
  // What each company ordered is the least it pays (2026-09-30): the same floor as Stripe.
  const orderedByCompany = await orderedExtrasByCompany(supabase);
  // Deals' special prices (0354), so revenue is what each company is actually charged.
  const deals = await dealsByCompany(supabase);

  for (const c of list) {
    // Test companies are left out of revenue (0353).
    if ((c as { is_test?: boolean }).is_test) continue;
    const b = billingByCompany.get(c.id) ?? null;
    const actualSeats = computeSeatUsage(activeUsers.get(c.id) ?? 0, includedSeatsForTier(c.tier));
    const seats = { ...actualSeats, extra: billedExtra(actualSeats.extra, orderedFor(orderedByCompany, c.id, c.tier).users) };
    const branchesExtra = billedExtra(
      Math.max(0, (operationalBranches.get(c.id) ?? 0) - includedBranchesForTier(c.tier)),
      orderedFor(orderedByCompany, c.id, c.tier).branches,
    );
    const row: Row = {
      id: c.id,
      name: c.name,
      tier: c.tier,
      status: c.status,
      billingStatus: b?.subscription_status ?? null,
      monthlyPence: 0,
      seatsUsed: seats.used,
      seatsExtra: seats.extra,
      branchesExtra: branchesExtra,
      periodEnd: b?.current_period_end ?? null,
      cancelAtEnd: b?.cancel_at_period_end ?? false,
    };

    if (isSubscriptionTier(c.tier)) {
      /* Base, seats AND BRANCHES. Branches were missing here until 2026-08-14, so the
         revenue page under-reported every company with an extra branch — Acme by £7.50 a
         month. Same omission as the customer billing page and the founder company page; this
         was the fourth copy of the same sum, which is why they now share one rule. */
      // Monthly worth: an Annual company counts as its yearly price over twelve (2026-09-30).
      const parts = dealMonthlyParts(
        deals.get(c.id),
        { planPence: TIER_BASE_PENCE[c.tier as keyof typeof TIER_BASE_PENCE], seatPence: EXTRA_SEAT_PENCE, branchPence: EXTRA_BRANCH_PENCE },
        seats.extra,
        branchesExtra,
      );
      row.monthlyPence = monthlyRecurringPence({
        basePence: parts.basePence,
        extraSeats: 1,
        seatPence: parts.seatsPence,
        extraBranches: 1,
        branchPence: parts.branchesPence,
        planYearly: (b as { billing_interval?: string | null } | null)?.billing_interval === "year",
        extrasYearly: (b as { extras_interval?: string | null } | null)?.extras_interval === "year",
        yearlyMonthsCharged: MRR_YEARLY_MONTHS,
      });
      const st = b?.subscription_status ?? null;
      if (["active", "trialing", "past_due"].includes(st ?? "")) {
        mrrPence += row.monthlyPence;
      }
      if (["past_due", "unpaid"].includes(st ?? "")) pastDue += 1;
      subs.push(row);
    } else if (c.tier === "black") {
      blacks.push(row);
    }
  }

  const activeSubs = subs.filter((r) =>
    ["active", "trialing", "past_due"].includes(r.billingStatus ?? ""),
  ).length;

  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Revenue</h1>
        <p className="page-subtitle">
          Committed monthly revenue, per company billing state, and free Black accounts. Read
          only oversight.
        </p>
      </div>

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Committed MRR"
          value={`${formatPence(mrrPence)}/mo`}
          sub="Live subscriptions only"
        />
        <StatCard label="Active subscriptions" value={activeSubs} sub={`${subs.length} on a tier`} />
        <StatCard
          label="Payment due"
          value={pastDue}
          sub={pastDue === 0 ? "All current" : "Needs attention"}
        />
        <StatCard label="Free accounts" value={blacks.length} sub="Black, nothing to pay" />
      </section>

      <section aria-label="Subscriptions" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Subscription tiers ({subs.length})
        </h2>
        {subs.length === 0 ? (
          <p className="text-sm text-white/60">No subscription companies yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="py-1 pr-4 font-medium">Company</th>
                  <th className="py-1 pr-4 font-medium">Tier</th>
                  <th className="py-1 pr-4 font-medium">Billing</th>
                  <th className="py-1 pr-4 font-medium">Seats</th>
                  {/* Branches earn a column now that they are actually charged: without it the
                      Monthly figure is unexplainable from the row it sits in. */}
                  <th className="py-1 pr-4 font-medium">Extra branches</th>
                  <th className="py-1 pr-4 font-medium">Monthly</th>
                  <th className="py-1 font-medium">Renews</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((r) => {
                  const bp = billingStatusPill(r.billingStatus);
                  return (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="py-1.5 pr-4">
                        <Link
                          href={`/founder/companies/${r.id}`}
                          className="text-white/90 hover:text-gold-300"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-4 text-white/70">{tierLabel(r.tier)}</td>
                      <td className="py-1.5 pr-4">
                        <span className={`pill ${bp.cls}`}>{bp.text}</span>
                        {r.cancelAtEnd ? (
                          <span className="ml-1 pill pill-amber">Cancelling</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-4 text-white/70">
                        {r.seatsUsed}
                        {r.seatsExtra > 0 ? ` (+${r.seatsExtra})` : ""}
                      </td>
                      <td className="py-1.5 pr-4 text-white/70">
                        {r.branchesExtra > 0
                          ? `${r.branchesExtra} (${formatPence(r.branchesExtra * EXTRA_BRANCH_PENCE)})`
                          : "—"}
                      </td>
                      <td className="py-1.5 pr-4 text-white/90">
                        {formatPence(r.monthlyPence)}
                      </td>
                      <td className="py-1.5 text-white/60">{fmtDate(r.periodEnd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Black" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Black, free accounts ({blacks.length})
        </h2>
        {blacks.length === 0 ? (
          <p className="text-sm text-white/60">No Black accounts.</p>
        ) : (
          <div className="space-y-2">
            {blacks.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <Link href={`/founder/companies/${r.id}`} className="text-white/90 hover:text-gold-300">
                  {r.name}
                </Link>
                <span className="pill pill-neutral">Free, founder granted</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
