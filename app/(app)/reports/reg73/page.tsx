import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import { listReg73Visits } from "@/lib/reg73/data";
import StartVisitButton from "@/components/reg73/start-visit-button";

export const metadata: Metadata = { title: "Regulation 73 visits" };

const VIEW_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];
const START_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];

function fmtDate(v: string | null): string {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

export default async function Reg73ListPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/reports");
  const companyId = profile.company_id;
  const canStart = START_ROLES.includes(profile.role);

  const branches = await listAccessibleBranchTypes(companyId, profile.role, user.id);
  const visitsByBranch = await Promise.all(branches.map((b) => listReg73Visits(companyId, b.id)));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href="/reports" label="Back to reports" />
      <div>
        <h1 className="page-title">Regulation 73 visits</h1>
        <p className="page-subtitle">
          The Responsible Individual branch visit report, pre-filled from the site. One per branch.
        </p>
      </div>

      {branches.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">No branches to visit yet.</div>
      ) : (
        branches.map((b, i) => {
          const visits = visitsByBranch[i];
          return (
            <section key={b.id} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-white">{b.name}</h2>
                {canStart ? <StartVisitButton branchId={b.id} /> : null}
              </div>

              {visits.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">No visits recorded yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-white/5">
                  {visits.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`/reports/reg73/${v.id}`} className="font-medium text-white hover:text-gold-300">
                        {v.reference ?? `Visit ${fmtDate(v.start_date)}`}
                      </Link>
                      <span className="flex items-center gap-3 text-xs">
                        <span
                          className={
                            v.status === "submitted"
                              ? "rounded-full bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-300"
                              : "rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white/60"
                          }
                        >
                          {v.status === "submitted" ? "Submitted" : "Draft"}
                        </span>
                        {v.status === "submitted" ? (
                          <a href={`/api/reports/reg73/${v.id}/pdf`} className="text-gold-300 underline">
                            PDF
                          </a>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
