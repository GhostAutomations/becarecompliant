import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { StatCard } from "@/components/founder/stat-card";
import { computeSeatUsage, formatPence } from "@/lib/billing/seats";
import { TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import { billingStatusPill, tierLabel } from "@/lib/founder/format";
import { londonMonthKey } from "@/lib/founder/stats";

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
  const thisMonth = londonMonthKey(new Date());

  const [
    { data: companies },
    { data: profiles },
    { data: billingRows },
    { data: usageRows },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, tier, status")
      .neq("status", "archived")
      .order("name", { ascending: true }),
    supabase.from("profiles").select("company_id, status, role"),
    supabase
      .from("company_billing")
      .select(
        "company_id, subscription_status, billed_tier, seat_quantity, current_period_end, cancel_at_period_end",
      ),
    supabase
      .from("usage_monthly")
      .select("company_id, kind, cost_pence_sum")
      .eq("month", `${thisMonth}-01`),
  ]);

  const list = companies ?? [];
  const billingByCompany = new Map(
    (billingRows ?? []).map((b) => [b.company_id, b]),
  );

  const activeUsers = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.company_id && p.status === "active" && p.role !== "platform_admin") {
      activeUsers.set(p.company_id, (activeUsers.get(p.company_id) ?? 0) + 1);
    }
  }

  // This-month usage cost per company (our metered cost; Diamond invoice basis).
  const usageCost = new Map<string, number>();
  for (const u of usageRows ?? []) {
    if (!u.company_id) continue;
    usageCost.set(
      u.company_id,
      (usageCost.get(u.company_id) ?? 0) + (u.cost_pence_sum ?? 0),
    );
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
    periodEnd: string | null;
    cancelAtEnd: boolean;
  };

  const subs: Row[] = [];
  const diamonds: Row[] = [];
  const blacks: Row[] = [];
  let mrrPence = 0;
  let pastDue = 0;

  for (const c of list) {
    const b = billingByCompany.get(c.id) ?? null;
    const seats = computeSeatUsage(activeUsers.get(c.id) ?? 0);
    const row: Row = {
      id: c.id,
      name: c.name,
      tier: c.tier,
      status: c.status,
      billingStatus: b?.subscription_status ?? null,
      monthlyPence: 0,
      seatsUsed: seats.used,
      seatsExtra: seats.extra,
      periodEnd: b?.current_period_end ?? null,
      cancelAtEnd: b?.cancel_at_period_end ?? false,
    };

    if (isSubscriptionTier(c.tier)) {
      row.monthlyPence =
        TIER_BASE_PENCE[c.tier as keyof typeof TIER_BASE_PENCE] +
        seats.extraCostPence;
      const st = b?.subscription_status ?? null;
      if (["active", "trialing", "past_due"].includes(st ?? "")) {
        mrrPence += row.monthlyPence;
      }
      if (["past_due", "unpaid"].includes(st ?? "")) pastDue += 1;
      subs.push(row);
    } else if (c.tier === "diamond") {
      row.monthlyPence = usageCost.get(c.id) ?? 0;
      diamonds.push(row);
    } else if (c.tier === "black") {
      blacks.push(row);
    }
  }

  const diamondMtdPence = diamonds.reduce((s, r) => s + r.monthlyPence, 0);
  const activeSubs = subs.filter((r) =>
    ["active", "trialing", "past_due"].includes(r.billingStatus ?? ""),
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Revenue</h1>
        <p className="page-subtitle">
          Committed monthly revenue, per company billing state, Diamond usage to
          invoice and Black accounts. Read only oversight.
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
        <StatCard
          label="Diamond usage, month"
          value={formatPence(diamondMtdPence)}
          sub={`${diamonds.length} Diamond accounts`}
        />
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

      <section aria-label="Diamond" className="glass-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">
            Diamond, usage to invoice ({diamonds.length})
          </h2>
          <Link href="/founder/usage" className="text-xs text-gold-300 hover:underline">
            Usage detail
          </Link>
        </div>
        {diamonds.length === 0 ? (
          <p className="text-sm text-white/60">No Diamond accounts.</p>
        ) : (
          <div className="space-y-2">
            {diamonds.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <Link href={`/founder/companies/${r.id}`} className="text-white/90 hover:text-gold-300">
                  {r.name}
                </Link>
                <span className="text-white/80">
                  {formatPence(r.monthlyPence)} this month
                </span>
              </div>
            ))}
            <p className="pt-2 text-xs text-white/40">
              Shows our metered cost this month. The customer facing Diamond rate
              is set in Stripe env and is not finalised: confirm before the first
              live Diamond invoice.
            </p>
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
