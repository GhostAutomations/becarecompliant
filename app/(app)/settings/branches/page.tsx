import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import BranchForm from "@/components/settings/branch-form";
import { orderBranches, chargeableCount } from "@/lib/branches/ordering";
import {
  includedBranchesForTier,
  EXTRA_BRANCH_PENCE,
  formatPence,
} from "@/lib/billing/seats";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const [{ data: branches }, { data: company }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind, status, address, created_at")
      .eq("company_id", profile.company_id),
    supabase.from("companies").select("tier").eq("id", profile.company_id).maybeSingle(),
  ]);

  /* ORDER AND LABELS COME FROM THE RULE, NOT FROM THE QUERY. The old .order("kind") put the
     office LAST, because "branch" sorts before "team" — an accident nobody chose. Phil,
     2026-08-20: "put office team at the top, then the included branch, then any chargeble
     branches." See lib/branches/ordering.ts for why the included one is the oldest one. */
  const included = includedBranchesForTier(company?.tier ?? "business");
  const list = orderBranches(branches ?? [], included);
  const chargeable = chargeableCount(list);
  /* Black is stored as an absurd allowance rather than a flag, so say "as many as you need"
     instead of printing 9999 at a customer. */
  const unlimited = included >= 9999;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Branches</h1>
        <p className="page-subtitle">
          Your office, then your branches. Your plan includes the office and{" "}
          {unlimited
            ? "as many branches as you need"
            : `${included} ${included === 1 ? "branch" : "branches"}`}
          . Records belong to exactly one branch.
        </p>
      </div>

      <div className="space-y-3">
        {list.map((branch) => (
          <div key={branch.id} className="glass-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={branch.kind === "team" ? "pill-neutral" : "pill-green"}
              >
                {branch.kind === "team" ? "Team" : "Branch"}
              </span>
              {/* WHAT IT COSTS, said on the screen. Billing knew this all along (it counts
                  branches beyond the tier) but only the invoice ever saw it, so nobody could
                  tell which branch the £7.50 was for. */}
              {branch.billing === "included" && (
                <span className="pill-neutral">Included in your plan</span>
              )}
              {branch.billing === "chargeable" && (
                <span className="pill-amber">
                  {formatPence(EXTRA_BRANCH_PENCE)} a month
                </span>
              )}
              <span className="text-xs text-white/50">{branch.status}</span>
            </div>
            <BranchForm
              branchId={branch.id}
              initialName={branch.name}
              initialAddress={branch.address ?? ""}
            />
          </div>
        ))}
      </div>

      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">
          Additional branches
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Extra branches are a paid add on at {formatPence(EXTRA_BRANCH_PENCE)} per branch per
          month, added to your subscription. Ask us to add one and it appears here.
        </p>
        <p className="mt-2 text-sm text-white/60">
          {chargeable === 0
            ? unlimited
              ? "Your plan covers as many branches as you need, so none of these is charged for."
              : "You are not paying for any extra branches."
            : `You have ${chargeable} extra ${chargeable === 1 ? "branch" : "branches"}, marked above, at ${formatPence(chargeable * EXTRA_BRANCH_PENCE)} a month in total.`}
        </p>
      </div>
    </div>
  );
}
