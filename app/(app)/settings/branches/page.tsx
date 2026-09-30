import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import BranchForm from "@/components/settings/branch-form";
import { orderBranches, chargeableCount } from "@/lib/branches/ordering";
import { type BranchAddressRow, officeAddress } from "@/lib/branches/office-address";
import {
  includedBranchesForTier,
  EXTRA_BRANCH_PENCE,
  formatPence,
} from "@/lib/billing/seats";
import { getBranchTerms } from "@/lib/branches/company-word";
import { getDeal } from "@/lib/billing/deal-store";
import { branchExtrasPence, dealPrices } from "@/lib/billing/deal";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const bw = await getBranchTerms(profile.company_id);
  // Their agreed branch price, flat or two-step (0354); the list price otherwise.
  const unit = dealPrices(await getDeal(await createClient(), profile.company_id), {
    planPence: 0,
    seatPence: 0,
    branchPence: EXTRA_BRANCH_PENCE,
  });

  const supabase = await createClient();
  const [{ data: branches }, { data: company }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, kind, status, address, uses_office_address, created_at")
      .eq("company_id", profile.company_id),
    supabase.from("companies").select("tier").eq("id", profile.company_id).maybeSingle(),
  ]);

  /* ORDER AND LABELS COME FROM THE RULE, NOT FROM THE QUERY. The old .order("kind") put the
     office LAST, because "branch" sorts before "team" — an accident nobody chose. Phil,
     2026-08-20: "put office team at the top, then the included branch, then any chargeble
     branches." See lib/branches/ordering.ts for why the included one is the oldest one. */
  /* One address, resolved where it is used: a branch with no premises of its own
     shares the office's rather than keeping a copy that goes stale when we move. */
  const office = officeAddress((branches ?? []) as BranchAddressRow[]);
  const included = includedBranchesForTier(company?.tier ?? "business");
  const list = orderBranches(branches ?? [], included);
  const chargeable = chargeableCount(list);
  /* Black is stored as an absurd allowance rather than a flag, so say "as many as you need"
     instead of printing 9999 at a customer. */
  const unlimited = included >= 9999;

  return (
    <div className="page-shell space-y-8">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">{bw.many}</h1>
        <p className="page-subtitle">
          Your office, then your {bw.manyLower}. Your plan includes the office and{" "}
          {unlimited
            ? `as many ${bw.manyLower} as you need`
            : bw.count(included)}
          . Records belong to exactly one {bw.oneLower}.
        </p>
      </div>

      {office === null ? (
        <p className="form-error mt-0">
          The office has no address yet. Formal meeting letters print it in full, and
          any {bw.oneLower} set to use it has nothing to print, so set it first.
        </p>
      ) : null}

      <div className="space-y-3">
        {list.map((branch) => (
          <div key={branch.id} className="glass-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={branch.kind === "team" ? "pill-neutral" : "pill-green"}
              >
                {branch.kind === "team" ? "Team" : bw.one}
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
              isOffice={branch.kind === "team"}
              initialSharesOffice={Boolean(branch.uses_office_address)}
              officeAddress={office}
            />
          </div>
        ))}
      </div>

      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">
          Additional {bw.manyLower}
        </h2>
        <p className="mt-2 text-sm text-white/60">
          {unit.step
            ? `Extra ${bw.manyLower} are a paid add on: the first ${bw.count(unit.step.after)} at ${formatPence(unit.branchPence)} each, then ${formatPence(unit.step.pricePence)} each after that, per month, added to your subscription.`
            : `Extra ${bw.manyLower} are a paid add on at ${formatPence(unit.branchPence)} per ${bw.oneLower} per month, added to your subscription.`} Ask us to add one and it appears here.
        </p>
        <p className="mt-2 text-sm text-white/60">
          {chargeable === 0
            ? unlimited
              ? `Your plan covers as many ${bw.manyLower} as you need, so none of these is charged for.`
              : `You are not paying for any extra ${bw.manyLower}.`
            : `You have ${chargeable} extra ${chargeable === 1 ? bw.oneLower : bw.manyLower}, marked above, at ${formatPence(branchExtrasPence(chargeable, unit))} a month in total.`}
        </p>
      </div>
    </div>
  );
}
