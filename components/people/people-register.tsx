"use client";

/**
 * Client register shell. The server loads EVERY person once (all statuses, all the
 * viewer's branches); this component switches Branches and View (Main / Leavers /
 * LTS & Mat Leave / Archive) by filtering on the client, so those changes are
 * instant with no server round trip. Compliance Summary is a separate page, so that
 * option navigates. The URL is kept in sync (history.replaceState) for refresh/back.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import RegisterMatrix from "./register-matrix";
import type { RegisterRow } from "@/lib/people/types";
import type { BranchLite } from "@/lib/people/data";

type MatrixConfig = { supInterval: number; supAmber: number; rtwAmber: number; probationAmber: number };

const VIEW_META: Record<
  string,
  { title: string; scope: string; match: (r: RegisterRow) => boolean }
> = {
  main: {
    title: "People",
    scope: "active",
    match: (r) => r.person.employment_status === "active" && !r.person.archived_at,
  },
  leavers: {
    title: "Leavers",
    scope: "leaver",
    match: (r) => r.person.employment_status === "leaver" && !r.person.archived_at,
  },
  lts_mat: {
    title: "LTS & Mat Leave",
    scope: "lts_mat",
    match: (r) =>
      !r.person.archived_at &&
      (r.person.employment_status === "lts" || r.person.employment_status === "mat_leave"),
  },
  archive: {
    title: "Archive",
    scope: "archived",
    match: (r) => !!r.person.archived_at,
  },
};

export default function PeopleRegister({
  rows,
  branches,
  config,
  columnLabels,
  canManage,
  initialView,
  initialBranch,
}: {
  rows: RegisterRow[];
  branches: BranchLite[];
  config: MatrixConfig;
  columnLabels: Record<string, string>;
  canManage: boolean;
  initialView: string;
  initialBranch: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(VIEW_META[initialView] ? initialView : "main");
  const [branchId, setBranchId] = useState(initialBranch);
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const meta = VIEW_META[view];

  const filtered = rows.filter((r) => (!branchId || r.person.branch_id === branchId) && meta.match(r));

  function urlFor(v: string, b: string) {
    const params = new URLSearchParams();
    if (v !== "main") params.set("view", v);
    if (b) params.set("branch", b);
    const qs = params.toString();
    return `/people${qs ? `?${qs}` : ""}`;
  }

  function changeView(v: string) {
    if (v === "summary") {
      router.push(branchId ? `/people/summary?branch=${branchId}` : "/people/summary");
      return;
    }
    setView(v);
    window.history.replaceState(null, "", urlFor(v, branchId));
  }

  function changeBranch(b: string) {
    setBranchId(b);
    window.history.replaceState(null, "", urlFor(view, b));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">{meta.title}</h1>
        {canManage && view === "main" ? (
          <Link href="/people/new" className="btn-primary">
            Add person
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {branchOptions.length > 1 ? (
          <label className="flex items-center gap-2 text-sm font-bold text-white">
            Branches
            <select className="inline-cell" value={branchId} onChange={(e) => changeBranch(e.target.value)}>
              <option value="">All branches</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm font-bold text-white">
          View
          <select className="inline-cell" value={view} onChange={(e) => changeView(e.target.value)}>
            <option value="main">Matrix</option>
            <option value="summary">Compliance</option>
            <option value="leavers">Leavers</option>
            <option value="lts_mat">LTS & Mat Leave</option>
            <option value="archive">Archive</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
              <NavIcon icon="people" className="h-6 w-6" />
            </span>
            {view === "main" ? (
              <>
                <h2 className="text-base font-semibold text-white">No People records yet</h2>
                <p className="max-w-md text-sm text-white/60">
                  Add your first staff member and their supervision, appraisal, DBS,
                  right to work and training checks are scheduled automatically.
                </p>
                {canManage ? (
                  <Link href="/people/new" className="btn-primary mt-2">
                    Add your first person
                  </Link>
                ) : null}
              </>
            ) : (
              <h2 className="text-base font-semibold text-white">No {meta.title.toLowerCase()} to show</h2>
            )}
          </div>
        ) : (
          <RegisterMatrix
            rows={filtered}
            config={config}
            editable={canManage}
            columnLabels={columnLabels}
            scope={meta.scope}
            returnTo={urlFor(view, branchId)}
          />
        )}
      </div>
    </div>
  );
}
