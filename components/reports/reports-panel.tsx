"use client";

/**
 * Be Care Compliant — reports chooser (Phase 8).
 * Pick a branch (or the whole company) then download each report as PDF or CSV.
 * Downloads hit the tier gated /api/reports routes as plain links, so no data is
 * ever built client side. When exports are not on the company's tier the cards
 * show a calm upgrade state instead of the buttons.
 */

import { useState } from "react";

type BranchLite = { id: string; name: string };

function DownloadPair({ href }: { href: (format: "pdf" | "csv") => string }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <a href={href("pdf")} className="btn-primary px-3 py-2 text-xs">
        Download PDF
      </a>
      <a href={href("csv")} className="btn-outline px-3 py-2 text-xs">
        Download CSV
      </a>
    </div>
  );
}

export default function ReportsPanel({
  branches,
  entitled,
  isAdmin,
}: {
  branches: BranchLite[];
  entitled: boolean;
  isAdmin: boolean;
}) {
  const [branch, setBranch] = useState<string>("all");
  const q = (extra: string) => `branch=${encodeURIComponent(branch)}&${extra}`;

  return (
    <div className="space-y-6">
      <section className="glass-card p-5">
        <label htmlFor="branch" className="form-label">
          Branch
        </label>
        <select
          id="branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="mt-1 max-w-sm"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-white/50">
          Reports cover active records only. Leavers, archived people and cancelled or discharged
          service users are excluded, matching the registers.
        </p>
      </section>

      {!entitled && (
        <section className="glass-card p-5 border border-amber-300/30">
          <h2 className="text-sm font-semibold text-white/90">Reporting exports are a Pro feature</h2>
          <p className="mt-2 text-sm text-white/60">
            Register, compliance and audit exports are available on the Pro tier and above. You can
            still download a single record's own evidence PDF from that record on any tier.
          </p>
          <a href="/settings/billing" className="btn-primary mt-3 inline-block px-3 py-2 text-xs">
            View billing
          </a>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white">People compliance register</h2>
          <p className="text-sm text-white/60">
            Every active person with their compliance status, overdue and due soon checks, and
            probation history.
          </p>
          {entitled && <DownloadPair href={(f) => `/api/reports/register?${q(`population=people&format=${f}`)}`} />}
        </div>

        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white">Service User compliance register</h2>
          <p className="text-sm text-white/60">
            Every active service user with their compliance status and the checks that need action.
          </p>
          {entitled && (
            <DownloadPair href={(f) => `/api/reports/register?${q(`population=service_users&format=${f}`)}`} />
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white">Compliance report</h2>
          <p className="text-sm text-white/60">
            People and Service Users together: a RAG summary and the full overdue lists, for a branch
            or the whole company.
          </p>
          {entitled && <DownloadPair href={(f) => `/api/reports/compliance?${q(`format=${f}`)}`} />}
        </div>

        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white">Audit trail</h2>
          <p className="text-sm text-white/60">
            Who changed what and when across your company. Open the log to filter, or export it for an
            inspector.
          </p>
          {isAdmin ? (
            <div className="mt-3 flex items-center gap-2">
              <a href="/reports/audit" className="btn-outline px-3 py-2 text-xs">
                Open audit log
              </a>
              {entitled && (
                <a href="/api/reports/audit?scope=company&format=pdf" className="btn-primary px-3 py-2 text-xs">
                  Export PDF
                </a>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-white/50">
              The company wide audit log is available to Company Admins. You can view each record's
              history on the record itself.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
