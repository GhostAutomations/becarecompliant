"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BranchLite } from "@/lib/service-users/data";

/** View keys and where each navigates (register variants use /service-users?view=). */
const VIEW_PATHS: Record<string, string> = {
  main: "/service-users",
  summary: "/service-users/summary",
  hospital: "/service-users?view=hospital",
  respite: "/service-users?view=respite",
  cancelled: "/service-users?view=cancelled",
};

/** The Service User area nav for the Summary page: a Branches dropdown and a View
 *  dropdown. Both navigate on change and preserve the selected branch. */
export default function SuViewNav({
  current,
  branchId,
  branches,
}: {
  current: string;
  branchId: string | null;
  branches: BranchLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Service Users are only assigned to a branch, never the office (team).
  const branchOptions = branches.filter((b) => b.kind === "branch");

  const [pendingView, setPendingView] = useState<string | null>(null);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  useEffect(() => {
    if (!isPending) {
      setPendingView(null);
      setPendingBranch(null);
    }
  }, [isPending]);

  const shownView = pendingView ?? current;
  const shownBranch = pendingBranch ?? branchId ?? "";

  function go(path: string, branch: string) {
    const withBranch = branch ? `${path}${path.includes("?") ? "&" : "?"}branch=${branch}` : path;
    startTransition(() => router.push(withBranch));
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {branchOptions.length > 1 ? (
        <label className="flex items-center gap-2 text-sm font-bold text-white">
          Branches
          <select
            className="inline-cell"
            value={shownBranch}
            onChange={(e) => {
              setPendingBranch(e.target.value);
              go(VIEW_PATHS[shownView] ?? "/service-users", e.target.value);
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
          value={shownView}
          onChange={(e) => {
            setPendingView(e.target.value);
            go(VIEW_PATHS[e.target.value] ?? "/service-users", shownBranch);
          }}
        >
          <option value="main">Main</option>
          <option value="summary">Summary</option>
          <option value="hospital">Hospital</option>
          <option value="respite">Respite</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span
          aria-hidden
          className={`h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-gold-400 transition-opacity ${
            isPending ? "animate-spin opacity-100" : "opacity-0"
          }`}
        />
      </label>
    </div>
  );
}
