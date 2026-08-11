import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getPolicyCoverage } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Policy coverage" };

/**
 * Who is behind on a policy, and on which one (THE LIST item 20).
 *
 * The dashboard tile is only useful if it can be acted on: seeing "66% up to date" and not
 * being able to find the two people is worse than not knowing. This is where the tile goes.
 *
 * The order matters. Somebody who signed an OLD VERSION is listed FIRST, because they are the
 * dangerous case: every other screen in the product shows their policy as completed, and it
 * is, just not the wording that is in force now.
 */
export default async function PolicyCoveragePage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");

  const coverage = await getPolicyCoverage(profile.company_id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href="/briefings" label="Back to Briefings" />

      <div>
        <h1 className="page-title">Policy coverage</h1>
        <p className="page-subtitle">
          Who has signed the current version of the policies you have sent out.
        </p>
      </div>

      <div className="glass-card p-5">
        <p className="text-[11px] uppercase text-white/40">Up to date</p>
        <p className="mt-1 text-3xl font-bold text-white">
          {coverage.pct == null ? "n/a" : `${Math.floor(coverage.pct)}%`}
        </p>
        <p className="text-sm text-white/60">
          {coverage.assigned === 0
            ? "No policy has been sent to anyone yet."
            : `${coverage.upToDate} of ${coverage.assigned} signed at the current version.`}
        </p>
      </div>

      {coverage.behind.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          {coverage.assigned === 0
            ? "Send a policy from the Briefings department and it will be tracked here."
            : "Everyone is on the current version of every policy they have been sent."}
        </div>
      ) : (
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Behind</h2>
          <ul className="mt-3 space-y-3">
            {coverage.behind.map((row) => (
              <li key={row.assignmentId} className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/people/${row.personId}`} className="text-sm text-gold-300 underline">
                    {row.personName}
                  </Link>
                  {row.signedVersion === null ? (
                    <span className="pill-neutral">Not signed</span>
                  ) : (
                    <span className="pill-amber">
                      <span className="pill-dot" /> On version {row.signedVersion}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/60">
                  {row.policyTitle} · current version {row.currentVersion}
                  {row.signedVersion !== null
                    ? ". They signed an earlier version, so this shows as completed everywhere else."
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
