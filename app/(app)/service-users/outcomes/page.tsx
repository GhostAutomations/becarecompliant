import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getOutcomesRegister } from "@/lib/service-users/data";
import { REVIEW_RAG_PILL } from "@/lib/service-users/outcome-consts";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const metadata: Metadata = { title: "Outcomes" };

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

export default async function OutcomesPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/service-users");
  const reg = await getOutcomesRegister(profile.company_id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/service-users" label="Back to Service Users" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Outcomes</h1>
          <p className="page-subtitle">
            Personal outcomes for service users, and the percentage achieving or progressing for the PQS.
          </p>
        </div>
        {reg.rows.length > 0 ? (
          <a href="/api/reports/outcomes?format=csv" className="btn-outline text-sm">Export CSV</a>
        ) : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Achieving or progressing</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">
            {reg.pqsPct === null ? "—" : `${reg.pqsPct}%`}
          </p>
          <p className="text-xs text-white/45">for the PQS return</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Outcomes tracked</p>
          <p className="mt-2 text-2xl font-bold text-white">{reg.totalInScope}</p>
          <p className="text-xs text-white/45">across active service users</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Achieving or progressing</p>
          <p className="mt-2 text-2xl font-bold text-white">{reg.totalAchievingOrProgressing}</p>
          <p className="text-xs text-white/45">of {reg.totalInScope}</p>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Service users</h2>
        {reg.rows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-white/50">
            No active service users yet. Add personal outcomes from a service user record.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                  <th className="py-2 pr-3">Service user</th>
                  <th className="py-2 pr-3">Branch</th>
                  <th className="py-2 pr-3 text-right">Outcomes</th>
                  <th className="py-2 pr-3 text-right">On track</th>
                  <th className="py-2 pr-3 text-right">%</th>
                  <th className="py-2 pr-3">Updates</th>
                </tr>
              </thead>
              <tbody>
                {reg.rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="py-2 pr-3">
                      <Link href={`/service-users/${r.id}/outcomes?from=/service-users/outcomes`} className="text-gold-300 hover:underline">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-white/60">{r.branch_name}</td>
                    <td className="py-2 pr-3 text-right text-white/70">{r.total}</td>
                    <td className="py-2 pr-3 text-right text-white/70">{r.achievingOrProgressing}</td>
                    <td className="py-2 pr-3 text-right">
                      {r.pct === null ? (
                        <span className="text-white/40">—</span>
                      ) : (
                        <span className={r.pct >= 100 ? "text-emerald-300" : r.pct >= 50 ? "text-white/80" : "text-amber-300"}>
                          {r.pct}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.reviewRag === "amber" || r.reviewRag === "red" ? (
                        <span className={`pill ${REVIEW_RAG_PILL[r.reviewRag]}`} title={r.reviewDue ? `Update due ${fmtDate(r.reviewDue)}` : undefined}>
                          {r.reviewLabel}
                        </span>
                      ) : r.reviewRag === "green" ? (
                        <span className="text-white/45">Up to date</span>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
