import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth/guards";
import { NavIcon } from "@/components/nav-icon";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const firstName = (profile.full_name || profile.email).split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="page-title">Welcome, {firstName}</h1>
        <p className="page-subtitle">
          Your compliance overview will live here. One glance: are we
          inspection ready?
        </p>
      </div>

      {/* RAG rollup strip (zero state until checks exist) */}
      <section aria-label="Compliance status" className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <span className="pill-green">
            <span className="pill-dot" /> Compliant
          </span>
          <p className="mt-3 text-3xl font-bold text-navy-950">0</p>
          <p className="text-xs text-slate-500">No checks configured yet</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-amber">
            <span className="pill-dot" /> Due soon
          </span>
          <p className="mt-3 text-3xl font-bold text-navy-950">0</p>
          <p className="text-xs text-slate-500">No checks configured yet</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-red">
            <span className="pill-dot" /> Overdue
          </span>
          <p className="mt-3 text-3xl font-bold text-navy-950">0</p>
          <p className="text-xs text-slate-500">No checks configured yet</p>
        </div>
      </section>

      {/* App grid */}
      <section aria-label="Sections" className="grid gap-4 sm:grid-cols-2">
        <Link href="/people" className="app-tile">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-800/10 text-navy-800">
            <NavIcon icon="people" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-navy-950">People</h2>
          <p className="text-sm text-slate-600">
            Your staff team register: supervisions, appraisals, DBS renewals,
            training refreshers.
          </p>
          <span className="pill-neutral mt-auto w-fit">Arrives in Phase 3</span>
        </Link>

        <Link href="/service-users" className="app-tile">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-800/10 text-navy-800">
            <NavIcon icon="serviceUsers" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-navy-950">
            Service Users
          </h2>
          <p className="text-sm text-slate-600">
            Your clients receiving care: care plan reviews, risk assessments,
            medication audits.
          </p>
          <span className="pill-neutral mt-auto w-fit">Arrives in Phase 4</span>
        </Link>
      </section>

      {/* Design system preview, for Phase 0 sign-off. Removed once approved. */}
      <details className="section-card" open>
        <summary>Design system preview (Phase 0 sign-off, will be removed)</summary>
        <div className="space-y-5 border-t border-white/50 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="demo-input" className="form-label">
                Text input
              </label>
              <input id="demo-input" placeholder="Canonical input" />
              <p className="form-hint">Hint text looks like this.</p>
            </div>
            <div>
              <label htmlFor="demo-select" className="form-label">
                Select
              </label>
              <select id="demo-select" defaultValue="">
                <option value="" disabled>
                  Choose an option
                </option>
                <option>Supervision</option>
                <option>Appraisal</option>
                <option>Care plan review</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="demo-textarea" className="form-label">
              Textarea
            </label>
            <textarea id="demo-textarea" placeholder="Canonical textarea" />
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-navy-900">
              <input type="checkbox" defaultChecked /> Checkbox
            </label>
            <label className="flex items-center gap-2 text-sm text-navy-900">
              <input type="radio" name="demo-radio" defaultChecked /> Radio A
            </label>
            <label className="flex items-center gap-2 text-sm text-navy-900">
              <input type="radio" name="demo-radio" /> Radio B
            </label>
            <input type="range" className="max-w-48" defaultValue={60} />
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary">
              Primary action
            </button>
            <button type="button" className="btn-outline">
              Secondary
            </button>
            <button type="button" className="btn-ghost">
              Ghost
            </button>
            <button type="button" className="btn-danger">
              Destructive
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <span className="pill-green">
              <span className="pill-dot" /> Compliant
            </span>
            <span className="pill-amber">
              <span className="pill-dot" /> Due soon
            </span>
            <span className="pill-red">
              <span className="pill-dot" /> Overdue
            </span>
            <span className="pill-neutral">Neutral</span>
          </div>
        </div>
      </details>
    </div>
  );
}
