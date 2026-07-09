"use client";

import { useRouter } from "next/navigation";
import type { BranchLite } from "@/lib/people/data";

/** View keys and where each navigates (register variants use /people?view=). */
const VIEW_PATHS: Record<string, string> = {
  main: "/people",
  summary: "/people/summary",
  leavers: "/people?view=leavers",
  lts_mat: "/people?view=lts_mat",
  archive: "/people?view=archive",
};

/**
 * The People area nav: a Branches dropdown and a View dropdown (Main, Compliance
 * Summary, Leavers, LTS & Mat Leave, Archive). Both navigate on change and preserve
 * the selected branch.
 */
export default function ViewNav({
  current,
  branchId,
  branches,
}: {
  current: string;
  branchId: string | null;
  branches: BranchLite[];
}) {
  const router = useRouter();
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const base = VIEW_PATHS[current] ?? "/people";
  const withBranch = (path: string) =>
    branchId ? `${path}${path.includes("?") ? "&" : "?"}branch=${branchId}` : path;

  return (
    <div className="flex flex-wrap items-center gap-4">
      {branchOptions.length > 1 ? (
        <label className="flex items-center gap-2 text-sm font-bold text-white">
          Branches
          <select
            className="inline-cell"
            value={branchId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              const path = base.split("?")[0];
              const query = base.includes("?") ? base.split("?")[1] : "";
              const withQuery = query ? `${path}?${query}` : path;
              router.push(v ? `${withQuery}${query ? "&" : "?"}branch=${v}` : withQuery);
            }}
          >
            <option value="">All branches</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-sm font-bold text-white">
        View
        <select
          className="inline-cell"
          value={current}
          onChange={(e) => router.push(withBranch(VIEW_PATHS[e.target.value] ?? "/people"))}
        >
          <option value="main">Main</option>
          <option value="summary">Compliance Summary</option>
          <option value="leavers">Leavers</option>
          <option value="lts_mat">LTS & Mat Leave</option>
          <option value="archive">Archive</option>
        </select>
      </label>
    </div>
  );
}
