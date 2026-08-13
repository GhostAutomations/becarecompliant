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
import FounderColumnNamesForm from "@/components/founder/founder-column-names-form";
import { REGISTER_COLUMNS } from "@/lib/people/logic";
import { SU_REGISTER_COLUMNS } from "@/lib/service-users/types";
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
import { TIER_LABELS } from "@/lib/stripe/config";
import ActionForm from "@/components/action-form";
import { addBranch, removeBranch, changeCompanyTier } from "@/app/(app)/founder/actions";
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
    .select("id, name, slug, tier, status, created_at, supervision_cycle_mode, people_column_labels, service_user_column_labels")
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
        "stripe_subscription_id, subscription_status, billed_tier, seat_quantity, current_period_end, cancel_at_period_end",
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

  // Staff (Team Member) logins are free, so they are not seats.
  const activeUsers = (profiles ?? []).filter(
    (p) => p.status === "active" && isBillableSeat(p.role),
  ).length;
  const seats = computeSeatUsage(activeUsers, includedSeatsForTier(company.tier));
  const isSub = isSubscriptionTier(company.tier);
  /* A company moved to Black keeps a live subscription until the end of the period it has
     already paid for, so "Black: no Stripe subscription attached" would be false for up to a
     month — and would hide the status, the period end and the "scheduled to cancel" row, which
     are exactly what somebody needs to see in that window. Show the billing detail whenever
     there is billing to show, not whenever the tier is one we sell. */
  const hasBillingRow = Boolean(billing?.stripe_subscription_id);
  const branchIncluded = includedBranchesForTier(company.tier ?? "business");
  const operationalBranches = (branches ?? []).filter((b) => (b as { kind?: string }).kind === "branch");
  const officeBranches = (branches ?? []).filter((b) => (b as { kind?: string }).kind !== "branch");
  // Extra branches are REAL MONEY on the subscription (one £7.50 line, quantity = beyond the
  // allowance), so the founder console has to include them or it reports a number Stripe
  // disagrees with. Acme showed £69.00/mo here while Stripe was billing £84.00.
  const extraBranchCount = Math.max(0, operationalBranches.length - branchIncluded);
  const monthlyTotalPence = isSub
    ? subscriptionMonthlyPence({
        basePence: TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE],
        extraSeats: seats.extra,
        seatPence: EXTRA_SEAT_PENCE,
        extraBranches: extraBranchCount,
        branchPence: EXTRA_BRANCH_PENCE,
      })
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
            ) : company.tier === "black" ? (
              "Free"
            ) : (
              "—"
            )
          }
          sub={
            isSub
              ? `${formatPence(monthlyTotalPence)}/mo` +
                (seats.extra > 0 || extraBranchCount > 0
                  ? ` · base ${formatPence(TIER_BASE_PENCE[company.tier as keyof typeof TIER_BASE_PENCE])}` +
                    (seats.extra > 0 ? ` + ${seats.extra} seat${seats.extra === 1 ? "" : "s"}` : "") +
                    (extraBranchCount > 0
                      ? ` + ${extraBranchCount} branch${extraBranchCount === 1 ? "" : "es"}`
                      : "")
                  : "")
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
        {/* OPERATIONAL branches only. The card counted the company's Office too, so it read
            "Branches 5" directly above copy saying "this tier includes 2 branches" — making a
            company two branches over its allowance look three over. The office is not a branch
            and is never billed, so it is named separately rather than counted. */}
        <StatCard
          label="Branches"
          value={operationalBranches.length}
          sub={
            (operationalBranches.map((b) => b.name).join(", ") || "None") +
            (officeBranches.length > 0 ? ` · plus ${officeBranches.map((b) => b.name).join(", ")}` : "")
          }
        />
      </section>

      {/* ADD A BRANCH (THE LIST item 16). Until now nothing in the product created one: every
          extra branch on the test company was added by hand in SQL, which is why the £7.50 a
          month the pricing page promises could never have been billed. Creating one here bills
          it immediately, prorated onto the next invoice like an extra user. */}
      <section aria-label="Branches" className="glass-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-white/80">Add a branch</h2>
        <p className="mb-3 text-xs text-white/50">
          {branchIncluded === 9999
            ? "This tier includes unlimited branches."
            : `This tier includes ${branchIncluded} branch${branchIncluded === 1 ? "" : "es"}. Beyond that, ${formatPence(EXTRA_BRANCH_PENCE)} per branch per month is added to their subscription. Tell the customer before you add one.`}
        </p>
        <ActionForm action={addBranch} hidden={{ company_id: company.id }} inline label="Add branch">
          <label htmlFor="new_branch_name" className="form-label">Branch name</label>
          <input id="new_branch_name" name="name" type="text" maxLength={80} required placeholder="e.g. Swansea" />
        </ActionForm>

        {/* REMOVING ONE. Until now Add was one way: provision a branch by mistake and the
            customer paid £7.50 a month for ever. Removal is an undo, not a way to erase
            history — migration 0181 refuses while anything at all references the branch,
            because the foreign keys would otherwise cascade away its Regulation 73 visits and
            Regulation 80 reviews. The office row is not listed: it is not a branch. */}
        {operationalBranches.length > 0 ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="mb-1 text-xs font-semibold text-white/70">Remove a branch</h3>
            <p className="mb-3 text-xs text-white/50">
              Only a branch with nothing recorded against it can be removed, so this undoes one
              added by mistake. Removing it stops the {formatPence(EXTRA_BRANCH_PENCE)} a month
              straight away.
            </p>
            <ul className="space-y-2">
              {operationalBranches.map((b) => (
                <li
                  key={b.id as string}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2"
                >
                  <span className="text-sm text-white/80">{b.name}</span>
                  <ActionForm
                    action={removeBranch}
                    hidden={{ company_id: company.id, branch_id: b.id as string }}
                    label="Remove"
                    savedLabel="Removed"
                    buttonClassName="btn-secondary text-xs"
                    className=""
                    confirm={`Remove ${b.name}? This cannot be undone, and it stops billing for that branch.`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* CHANGE THE PLAN. Until 2026-08-13 companies.tier was written at creation and by trial
          provisioning and by NOTHING ELSE, so a company could never move plan and no Business
          customer could upgrade. Moving DOWN from Pro is deliberately not offered yet: Pro
          includes more users and branches, so the extras bill rises as the base falls and the
          total barely moves. Nobody should agree to that without seeing the new number. */}
      <section aria-label="Plan" className="glass-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-white/80">Plan</h2>
        <p className="mb-3 text-xs text-white/50">
          On {TIER_LABELS[(company.tier ?? "business") as keyof typeof TIER_LABELS] ?? company.tier}.
          Moving to Black makes them free straight away and stops their subscription at the end of
          the period they have already paid for, so no money moves either way. Moving up to Pro is
          prorated onto their next invoice. Moving down from Pro is not built yet.
        </p>
        <ActionForm
          action={changeCompanyTier}
          hidden={{ company_id: company.id }}
          inline
          label="Change plan"
          savedLabel="Changed"
          confirm="Change this company's plan? This changes what they are charged."
        >
          <label htmlFor="new_tier" className="form-label">Move to</label>
          <select id="new_tier" name="tier" defaultValue="" required>
            <option value="" disabled>Choose a plan</option>
            {(["business", "pro", "black"] as const)
              // Not merely "anything but the current one": a Pro company offered Business is a
              // trap, because the server refuses that move every single time.
              .filter((t) => t !== company.tier && !(company.tier === "pro" && t === "business"))
              .map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
          </select>
        </ActionForm>
      </section>

      <section aria-label="Billing detail" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">Billing</h2>
        {isSub || hasBillingRow ? (
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
            {company.tier === "black"
              ? "Black tier: free, founder granted. No Stripe subscription attached."
              : "No subscription."}
          </p>
        )}
        {!isSub && hasBillingRow ? (
          <p className="mt-3 text-xs text-amber-200/80">
            On Black, but a subscription is still running. That is expected for the rest of the
            period they had already paid for, and it should show as scheduled to cancel above. If
            it does not, they are still being charged and it needs stopping in Stripe.
          </p>
        ) : null}
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

      <section aria-label="Register column terminology" className="glass-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-white/80">Register column terminology</h2>
        <p className="mb-3 text-sm text-white/60">
          Rename any register column to match the words this company uses. Leave a
          box blank to keep the default. Changes apply across the register, drill
          downs and exports for this company only.
        </p>
        <details className="section-card">
          <summary>People columns</summary>
          <div className="border-t border-white/10 p-5">
            <FounderColumnNamesForm
              companyId={company.id}
              population="people"
              columns={REGISTER_COLUMNS}
              labels={(company.people_column_labels as Record<string, string> | null) ?? {}}
            />
          </div>
        </details>
        <details className="section-card mt-3">
          <summary>Service User columns</summary>
          <div className="border-t border-white/10 p-5">
            <FounderColumnNamesForm
              companyId={company.id}
              population="service_users"
              columns={SU_REGISTER_COLUMNS}
              labels={(company.service_user_column_labels as Record<string, string> | null) ?? {}}
            />
          </div>
        </details>
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
