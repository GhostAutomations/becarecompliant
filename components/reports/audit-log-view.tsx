import "server-only";

/**
 * Be Care Compliant — audit log viewer (Phase 8), shared by the company and
 * founder consoles. Read only: a filter form (plain GET, no mutation), a table
 * newest first, and export links. Access is DB enforced by the audit_log read
 * policy; this component only presents what RLS already allowed.
 */

import type { AuditEntry } from "@/lib/audit-log/data";
import { AUDIT_ENTITY_TYPES } from "@/lib/audit-log/data";
import { fmtDateTime } from "@/lib/export/format";

export type AuditViewFilters = {
  actor?: string | null;
  entity?: string | null;
  from?: string | null;
  to?: string | null;
  company?: string | null;
};

function exportHref(base: string, filters: AuditViewFilters, format: "pdf" | "csv"): string {
  const p = new URLSearchParams();
  p.set("format", format);
  if (filters.actor) p.set("actor", filters.actor);
  if (filters.entity) p.set("entity", filters.entity);
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.company) p.set("company", filters.company);
  return `${base}&${p.toString()}`;
}

export default function AuditLogView({
  entries,
  filters,
  formAction,
  exportBase,
  scope,
  entitled,
}: {
  entries: AuditEntry[];
  filters: AuditViewFilters;
  /** Path the GET filter form posts to, e.g. /reports/audit. */
  formAction: string;
  /** Export route base, e.g. /api/reports/audit?scope=company. */
  exportBase: string;
  scope: "company" | "founder";
  /** Whether export is available (Pro+ for company; always for founder). */
  entitled: boolean;
}) {
  const showCompany = scope === "founder";
  return (
    <div className="space-y-5">
      <form method="get" action={formAction} className="glass-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="actor" className="form-label">Actor email</label>
            <input id="actor" name="actor" defaultValue={filters.actor ?? ""} placeholder="name@example.com" />
          </div>
          <div>
            <label htmlFor="entity" className="form-label">Area</label>
            <select id="entity" name="entity" defaultValue={filters.entity ?? ""}>
              <option value="">All areas</option>
              {AUDIT_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="form-label">From</label>
            <input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
          </div>
          <div>
            <label htmlFor="to" className="form-label">To</label>
            <input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
          </div>
          {showCompany && (
            <div className="lg:col-span-2">
              <label htmlFor="company" className="form-label">Company id</label>
              <input id="company" name="company" defaultValue={filters.company ?? ""} placeholder="Optional: a company id" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" className="btn-primary px-3 py-2 text-xs">Apply filters</button>
          <a href={formAction} className="btn-outline px-3 py-2 text-xs">Clear</a>
          {entitled && (
            <span className="ml-auto flex items-center gap-2">
              <a href={exportHref(exportBase, filters, "pdf")} className="btn-outline px-3 py-2 text-xs">Export PDF</a>
              <a href={exportHref(exportBase, filters, "csv")} className="btn-outline px-3 py-2 text-xs">Export CSV</a>
            </span>
          )}
        </div>
      </form>

      <div className="glass-card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-white/50">
              <th className="px-4 py-3">When</th>
              {showCompany && <th className="px-4 py-3">Company</th>}
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={showCompany ? 6 : 5} className="px-4 py-8 text-center text-white/50">
                  No audit entries match this selection.
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <tr key={e.id ?? i} className="border-b border-white/5 align-top">
                  <td className="px-4 py-3 text-white/80 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                  {showCompany && (
                    <td className="px-4 py-3 text-white/50">{e.company_id ? e.company_id.slice(0, 8) : "Platform"}</td>
                  )}
                  <td className="px-4 py-3 text-white/80">{e.actor_email || "System"}</td>
                  <td className="px-4 py-3 text-white/50">{e.actor_role || ""}</td>
                  <td className="px-4 py-3 text-white/70">{e.action}</td>
                  <td className="px-4 py-3 text-white/70">{e.summary || e.action.replace(/[._]/g, " ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-white/40">
        Showing the {entries.length} most recent matching entries. The audit trail is append only.
      </p>
    </div>
  );
}
