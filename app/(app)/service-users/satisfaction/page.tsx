import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getSatisfaction, SATISFACTION_QUESTIONS } from "@/lib/service-users/satisfaction";

export const metadata: Metadata = { title: "Satisfaction" };

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "—";
}

function ans(v: "Yes" | "No" | null | undefined) {
  if (v === "Yes") return <span className="pill pill-green">Yes</span>;
  if (v === "No") return <span className="pill pill-red">No</span>;
  return <span className="text-white/35">—</span>;
}

export default async function SatisfactionPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/service-users");

  const sat = await getSatisfaction(profile.company_id);
  const withReviews = sat.rows.filter((r) => r.reviewsInWindow > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/service-users" label="Back to Service Users" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Satisfaction</h1>
          <p className="page-subtitle">
            Service user feedback from personal plan reviews, and the customer satisfaction percentage for the PQS.
          </p>
        </div>
        {sat.reviewCount > 0 ? (
          <a href="/api/reports/satisfaction?format=csv" className="btn-outline text-sm">Export CSV</a>
        ) : null}
      </div>

      <p className="text-xs text-white/45">
        Period {fmtDate(sat.window.from)} to {fmtDate(sat.window.to)}. Scored from the Feedback, Call Times and Outcomes
        section of each Individual Plan Review completed in this period.
      </p>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Customer satisfaction</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{sat.pct === null ? "—" : `${sat.pct}%`}</p>
          <p className="text-xs text-white/45">positive answers, for the PQS return</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Reviews in period</p>
          <p className="mt-2 text-2xl font-bold text-white">{sat.reviewCount}</p>
          <p className="text-xs text-white/45">across active service users</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Positive answers</p>
          <p className="mt-2 text-2xl font-bold text-white">{sat.positive}</p>
          <p className="text-xs text-white/45">of {sat.answered} answered</p>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Service users</h2>
        {withReviews.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-white/50">
            No personal plan reviews completed in this period yet. Satisfaction is gathered when a review is completed.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                  <th className="py-2 pr-3">Service user</th>
                  <th className="py-2 pr-3">Branch</th>
                  <th className="py-2 pr-3">Last review</th>
                  {SATISFACTION_QUESTIONS.map((q) => (
                    <th key={q.key} className="py-2 pr-3">{q.label}</th>
                  ))}
                  <th className="py-2 pr-3 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {withReviews.map((r) => (
                  <tr key={r.id} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-3 text-white/85">{r.full_name}</td>
                    <td className="py-2 pr-3 text-white/60">{r.branch_name}</td>
                    <td className="py-2 pr-3 text-white/60">{fmtDate(r.latestReviewAt)}</td>
                    {SATISFACTION_QUESTIONS.map((q) => (
                      <td key={q.key} className="py-2 pr-3">{ans(r.latestAnswers[q.key])}</td>
                    ))}
                    <td className="py-2 pr-3 text-right">
                      {r.pct === null ? (
                        <span className="text-white/40">—</span>
                      ) : (
                        <span className={r.pct >= 80 ? "text-emerald-300" : r.pct >= 50 ? "text-white/80" : "text-amber-300"}>
                          {r.pct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-white/40">
              Yes / No shows the answers from each service user&apos;s most recent review in the period. The % is their positive
              rate across all their reviews in the period.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
