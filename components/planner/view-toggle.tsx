"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlannerView } from "@/lib/planner/actions";

export type PlannerView = "month" | "week" | "list";

/**
 * Month / Week / List for My Planner. The choice is SAVED PER USER, so the Planner opens on
 * whatever you were last looking at rather than on somebody's idea of a default.
 *
 * Week was added on 2026-08-15 (Phil). A month grid answers "how busy is August"; the question
 * somebody actually opens this page with is "where am I going today", and a week is the shape of
 * that question. 'calendar' became 'month' in migration 0187, so an existing preference carries.
 */
export default function PlannerViewToggle({ current }: { current: PlannerView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(view: PlannerView) {
    if (view === current) return;
    startTransition(async () => {
      await setPlannerView(view);
      router.refresh();
    });
  }

  const base = "px-3 py-1.5 disabled:opacity-100";
  const on = "bg-white/15 text-white";
  const off = "text-white/60 hover:bg-white/10";

  return (
    <div className="flex overflow-hidden rounded-lg border border-white/15 text-xs">
      {(["month", "week", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          disabled={pending}
          onClick={() => choose(v)}
          className={`${base} ${current === v ? on : off}`}
        >
          {v === "month" ? "Month" : v === "week" ? "Week" : "List"}
        </button>
      ))}
    </div>
  );
}
