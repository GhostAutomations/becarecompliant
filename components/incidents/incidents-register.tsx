"use client";

/**
 * Be Care Compliant — Incidents register (THE LIST item 21).
 *
 * Rows are loaded once (RLS-scoped) and filtered here, the same shape as Complaints.
 * The strip along the top is not decoration: "notifiable, not yet notified" is the
 * number that gets a provider into trouble, so it is shown before the list rather
 * than being something you have to go looking for.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_CATEGORIES,
  type IncidentRecord,
  type IncidentStatus,
} from "@/lib/incidents/types";
import { countable, summariseIncidents, needsAction } from "@/lib/incidents/summary";
import { formatUkDate, formatTime } from "@/lib/incidents/logic";

function statusPill(status: IncidentStatus) {
  const cls =
    status === "closed" ? "pill-green" : status === "under_review" ? "pill-amber" : "pill-neutral";
  return <span className={cls}>{INCIDENT_STATUS_LABELS[status]}</span>;
}

export default function IncidentsRegister({
  rows,
  branches,
  canManage,
  scope = "open",
}: {
  rows: IncidentRecord[];
  branches: Array<{ id: string; name: string }>;
  canManage: boolean;
  scope?: "open" | "closed";
}) {
  const [status, setStatus] = useState<"all" | IncidentStatus>("all");
  const [branch, setBranch] = useState("");
  const [category, setCategory] = useState("");

  const scoped = useMemo(
    () => rows.filter((r) => (scope === "closed" ? r.status === "closed" : r.status !== "closed")),
    [rows, scope],
  );

  const filtered = useMemo(
    () =>
      scoped.filter(
        (r) =>
          (status === "all" || r.status === status) &&
          (branch === "" || r.branch_id === branch) &&
          (category === "" || r.category === category),
      ),
    [scoped, status, branch, category],
  );

  // The strip counts EVERY incident the user can see, open or closed, not just this
  // view: an unnotified incident that someone closed is exactly the one to surface.
  const summary = useMemo(() => summariseIncidents(countable(rows)), [rows]);
  const outstanding = useMemo(() => needsAction(rows), [rows]);

  // Only offer categories that are actually in use, plus nothing else — a filter
  // listing twenty categories with one row between them is noise.
  const usedCategories = useMemo<string[]>(() => {
    const known = (INCIDENT_CATEGORIES as readonly string[]).filter((c) =>
      scoped.some((r) => r.category === c),
    );
    // A category recorded before this list changed still has rows: keep it filterable.
    const unknown = [...new Set(scoped.map((r) => r.category))].filter(
      (c) => !(INCIDENT_CATEGORIES as readonly string[]).includes(c),
    );
    return [...known, ...unknown];
  }, [scoped]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">
            {scope === "closed" ? "Incidents: Closed" : "Incidents: Open"}
          </h1>
          <p className="page-subtitle">
            {scope === "closed"
              ? "Incidents that have been reviewed and closed, with the lessons learnt recorded."
              : "Accidents, incidents and safeguarding matters, from the event through to the outcome."}
          </p>
        </div>
        {canManage && scope === "open" ? (
          <Link href="/incidents/new" className="btn-primary px-4 py-2 text-sm">
            Record an incident
          </Link>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Recorded</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.total}</p>
            <p className="text-xs text-white/50">{summary.open + summary.underReview} still open</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Notifiable</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.notifiable}</p>
            <p className="text-xs text-white/50">{summary.notified} notified to the regulator</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Safeguarding</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.safeguarding}</p>
            <p className="text-xs text-white/50">{summary.referred} referred</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Awaiting action</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                outstanding.length > 0 ? "text-red-300" : "text-white"
              }`}
            >
              {outstanding.length}
            </p>
            <p className="text-xs text-white/50">
              {outstanding.length === 0
                ? "Nothing outstanding"
                : "Flagged, but no date recorded yet"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {scope === "open" ? (
          <div>
            <label htmlFor="incident_status_filter" className="form-label">Status</label>
            <select
              id="incident_status_filter"
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | IncidentStatus)}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
            </select>
          </div>
        ) : null}
        {branches.length > 1 ? (
          <div>
            <label htmlFor="incident_branch_filter" className="form-label">Branch</label>
            <select id="incident_branch_filter" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        {usedCategories.length > 1 ? (
          <div>
            <label htmlFor="incident_category_filter" className="form-label">Category</label>
            <select
              id="incident_category_filter"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {usedCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          {scoped.length === 0
            ? scope === "closed"
              ? "No closed incidents yet. When an incident is closed it moves here."
              : "No open incidents. When an accident, incident or safeguarding matter happens, record it here."
            : "No incidents match these filters."}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-center text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Notifiable</th>
                <th className="px-4 py-3 font-medium">Safeguarding</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const who = [r.service_user_name, r.person_name].filter(Boolean).join(" / ");
                return (
                  <tr key={r.id} className="border-t border-white/5 text-center hover:bg-white/5">
                    <td className="px-4 py-3 text-white/70">
                      {formatUkDate(r.occurred_on)}
                      {r.occurred_at ? (
                        <span className="text-white/40"> {formatTime(r.occurred_at)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/incidents/${r.id}`} className="font-medium text-white hover:underline">
                        {r.category}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/70">{r.branch_name ?? "—"}</td>
                    <td className="px-4 py-3 text-white/70">{who || "—"}</td>
                    <td className="px-4 py-3">
                      {!r.notifiable ? (
                        <span className="text-white/30">—</span>
                      ) : r.notified_on ? (
                        <span className="pill-green">Notified {formatUkDate(r.notified_on)}</span>
                      ) : (
                        <span className="pill-red"><span className="pill-dot" /> Not notified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!r.safeguarding ? (
                        <span className="text-white/30">—</span>
                      ) : r.safeguarding_referred_on ? (
                        <span className="pill-green">
                          Referred {formatUkDate(r.safeguarding_referred_on)}
                        </span>
                      ) : (
                        <span className="pill-red"><span className="pill-dot" /> Not referred</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusPill(r.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
