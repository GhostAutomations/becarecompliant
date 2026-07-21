import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { StatCard } from "@/components/founder/stat-card";
import { CompanyStatusButton } from "@/components/founder/company-status-button";
import {
  UserStatusButton,
  InviteActions,
} from "@/components/founder/user-admin-controls";
import { EnterManageAsButton } from "@/components/founder/enter-manage-as-button";
import { ImportTemplatesButton } from "@/components/founder/import-templates-button";
import SupervisionCycleToggle from "@/components/founder/supervision-cycle-toggle";
import { computeSeatUsage, includedSeatsForTier, formatPence } from "@/lib/billing/seats";
import { TIER_BASE_PENCE, isSubscriptionTier } from "@/lib/stripe/config";
import {
  billingStatusPill,
  companyStatusPillClass,
  tierLabel,
} from "@/lib/founder/format";
import { monthKeyLabel } from "@/lib/founder/stats";
import { listFounderAudit } from "@/lib/audit-log/data";

export const metadata: Metadata = { title: "Company" };

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  team_member: "Team Member",
};

function userStatusPill(status: string): { cls: string; text: string } {
  if (status === "active") return { cls: "pill-green", text: "Active" };
  if (status === "invited") return { cls: "pill-amber", text: "Invited" };
  return { cls: "pill-neutral", text: "Disabled" };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default async function FounderCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slug, tier, status, created_at, supervision_cycle_mode")
    .eq("id", id)
    .maybeSingle();

  if (!company) notFound();

  const [
    { data: branches },
    { data: profiles },
    { data: invites },
    { data: billing },
    { data: usageRows },
    activity,
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind")
      .eq("company_id", id)
      .order("kind", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, status, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invites")
      .select("id, email, full_name, role, status, created_at")
      .eq("company_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("company_billing")
      .select(
        "subscription_status, billed_tier, seat_quantity, current_period_end, cancel_at_period_end",
      )
      .eq("company_id", id)
      .maybeSingle(),
    supabase
      .from("usage_monthly")
      .select("kind, month, event_count, units_sum, cost_pence_sum")
      .eq("company_id", id)
      .order("month", { ascending: false })
      .limit(24),
    listFounderAudit({ companyId: id, limit: 12 }),
  ]);

  const activeUsers = (profiles ?? []).filter((p) => p.status === "active").length;
  const seats = computeSeatUsage(activeUsers, includedSeatsForTier(company.tier));
  const isSub = isSubscriptionTier(company.tier);
  const monthlyTotalPence = isSub
    ? TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE] +
      seats.extraCostPence
    : 0;
  const bpill = billingStatusPill(billing?.subscription_status ?? null);

  // Usage grouped by month for a compact table.
  type UsageMonth = { sms: number; ai: number; smsCost: number; aiCost: number };
  const byMonth = new Map<string, UsageMonth>();
  for (const u of usageRows ?? []) {
    const key = String(u.month).slice(0, 7);
    const row = byMonth.get(key) ?? { sms: 0, ai: 0, smsCost: 0, aiCost: 0 };
    if (u.kind === "sms") {
      row.sms += u.units_sum ?? 0;
      row.smsCost += u.cost_pence_sum ?? 0;
    } else if (u.kind === "ai") {
      row.ai += u.units_sum ?? 0;
      row.aiCost += u.cost_pence_sum ?? 0;
    }
    byMonth.set(key, row);
  }
  const usageMonths = [...byMonth.entries()].sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  return (
    <div className="w-full space-y-6">
      <BackLink href="/founder" label="Back to Founder console" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{company.name}</h1>
            <span className={companyStatusPillClass(company.status)}>
              {company.status}
            </span>
          </div>
          <p className="page-subtitle">
            {tierLabel(company.tier)} tier · {company.slug} · created{" "}
            {fmtDate(company.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EnterManageAsButton companyId={company.id} />
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

      <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Billing"
          value={
            isSub ? (
              <span className={`pill ${bpill.cls}`}>{bpill.text}</span>
            ) : company.tier === "diamond" ? (
              "Usage only"
            ) : company.tier === "black" ? (
              "Free"
            ) : (
              "—"
            )
          }
          sub={
            isSub
              ? `${formatPence(monthlyTotalPence)}/mo`
              : company.tier === "diamond"
                ? "SMS + AI metered"
                : company.tier === "black"
                  ? "Founder granted"
                  : undefined
          }
        />
        <StatCard
          label="Seats"
          value={`${seats.used} / ${seats.included}`}
          sub={`${seats.extra} extra (${formatPence(seats.extraCostPence)}/mo)`}
        />
        <StatCard
          label="Users"
          value={activeUsers}
          sub={`${(profiles ?? []).length} total · ${(invites ?? []).length} pending`}
        />
        <StatCard
          label="Branches"
          value={(branches ?? []).length}
          sub={(branches ?? []).map((b) => b.name).join(", ") || "None"}
        />
      </section>

      <section aria-label="Billing detail" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">Billing</h2>
        {isSub ? (
          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between">
              <span className="text-white/60">Status</span>
              <span className={`pill ${bpill.cls}`}>{bpill.text}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Billed tier</span>
              <span className="text-white/90">
                {billing?.billed_tier ? tierLabel(billing.billed_tier) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Extra seats billed</span>
              <span className="text-white/90">{billing?.seat_quantity ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Current period ends</span>
              <span className="text-white/90">
                {fmtDate(billing?.current_period_end ?? null)}
              </span>
            </div>
            {billing?.cancel_at_period_end ? (
              <div className="flex justify-between sm:col-span-2">
                <span className="text-white/60">Scheduled to cancel</span>
                <span className="pill pill-amber">At period end</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-white/60">
            {company.tier === "diamond"
              ? "Diamond tier: no subscription. Billed on metered SMS and AI usage only (see below)."
              : company.tier === "black"
                ? "Black tier: free, founder granted. No Stripe subscription attached."
                : "No subscription."}
          </p>
        )}
      </section>

      <section aria-label="Usage" className="glass-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">
            Metered usage
          </h2>
          <Link href="/founder/usage" className="text-xs text-gold-300 hover:underline">
            All companies
          </Link>
        </div>
        {usageMonths.length === 0 ? (
          <p className="text-sm text-white/60">
            Nothing metered yet. SMS escalations and AI features appear here from
            their first use.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="py-1 pr-4 font-medium">Month</th>
                  <th className="py-1 pr-4 font-medium">SMS</th>
                  <th className="py-1 pr-4 font-medium">AI units</th>
                  <th className="py-1 font-medium">Our cost</th>
                </tr>
              </thead>
              <tbody>
                {usageMonths.map(([key, m]) => (
                  <tr key={key} className="border-t border-white/10">
                    <td className="py-1.5 pr-4 text-white/80">{monthKeyLabel(key)}</td>
                    <td className="py-1.5 pr-4 text-white/80">
                      {m.sms.toLocaleString("en-GB")}
                    </td>
                    <td className="py-1.5 pr-4 text-white/80">
                      {m.ai.toLocaleString("en-GB")}
                    </td>
                    <td className="py-1.5 text-white/60">
                      {formatPence(m.smsCost + m.aiCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Company settings" className="glass-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-white/80">Supervision cycle</h2>
        <p className="mb-3 text-sm text-white/60">
          How this company runs the People supervision cycle. Changing it updates the
          matrix columns and how the next supervision is scheduled.
        </p>
        <SupervisionCycleToggle
          companyId={company.id}
          mode={(company.supervision_cycle_mode as "appraisal" | "four_supervisions") ?? "appraisal"}
        />
      </section>

      <section aria-label="Templates" className="glass-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-white/80">Templates</h2>
        <p className="mb-3 text-sm text-white/60">
          Copy the latest founder library (forms and training courses) into this
          company. Anything it already has is skipped, so this is safe to run
          again. Use it when you have added or updated master templates after the
          company was created.
        </p>
        <ImportTemplatesButton companyId={company.id} />
      </section>

      <section aria-label="Users" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Users ({(profiles ?? []).length})
        </h2>
        {(profiles ?? []).length === 0 ? (
          <p className="text-sm text-white/60">
            No users yet. Invite the first Admin from the Founder console.
          </p>
        ) : (
          <div className="space-y-2">
            {(profiles ?? []).map((p) => {
              const s = userStatusPill(p.status);
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-white/90">
                      {p.full_name || p.email}
                    </p>
                    <p className="truncate text-xs text-white/50">{p.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill pill-neutral">
                      {ROLE_LABELS[p.role] ?? p.role}
                    </span>
                    <span className={`pill ${s.cls}`}>{s.text}</span>
                    {p.role !== "company_admin" && p.role !== "platform_admin" ? (
                      <UserStatusButton userId={p.id} current={p.status} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(invites ?? []).length > 0 ? (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              Pending invites ({(invites ?? []).length})
            </p>
            <div className="space-y-2">
              {(invites ?? []).map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-white/80">
                    {i.full_name || i.email}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="pill pill-neutral">
                      {ROLE_LABELS[i.role] ?? i.role}
                    </span>
                    <span className="pill pill-amber">Pending</span>
                    <InviteActions inviteId={i.id} companyId={company.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section aria-label="Recent activity" className="glass-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">Recent activity</h2>
          <Link
            href={`/founder/audit?company=${company.id}`}
            className="text-xs text-gold-300 hover:underline"
          >
            Full audit
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-white/60">No recorded activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activity.map((a, idx) => (
              <div
                key={a.id ?? idx}
                className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <span className="min-w-0 text-white/80">{a.summary}</span>
                <span className="shrink-0 text-xs text-white/40">
                  {a.actor_email ?? "system"} · {fmtDate(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
