"use client";

import { useRouter } from "next/navigation";
import type { BranchLite } from "@/lib/people/data";

/**
 * The People area nav: a Branches dropdown (All branches + each branch) and a View
 * dropdown (Main = the register table, Summary = the stat cards). Both navigate on
 * change and preserve the selected branch.
 */
export default function ViewNav({
  current,
  branchId,
  branches,
}: {
  current: "register" | "summary";
  branchId: string | null;
  branches: BranchLite[];
}) {
  const router = useRouter();
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const base = current === "summary" ? "/people/summary" : "/people";

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
              router.push(v ? `${base}?branch=${v}` : base);
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
          onChange={(e) => {
            const path = e.target.value === "summary" ? "/people/summary" : "/people";
            router.push(branchId ? `${path}?branch=${branchId}` : path);
          }}
        >
          <option value="register">Main</option>
          <option value="summary">Summary</option>
        </select>
      </label>
    </div>
  );
}
