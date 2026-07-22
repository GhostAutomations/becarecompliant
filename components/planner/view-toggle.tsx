"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlannerView } from "@/lib/planner/actions";

/** Calendar / List toggle for My Planner. The choice is saved per user so it
 *  persists across pages and sessions. */
export default function PlannerViewToggle({ current }: { current: "calendar" | "list" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(view: "calendar" | "list") {
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
      <button type="button" disabled={pending} onClick={() => choose("calendar")} className={`${base} ${current === "calendar" ? on : off}`}>
        Calendar
      </button>
      <button type="button" disabled={pending} onClick={() => choose("list")} className={`${base} ${current === "list" ? on : off}`}>
        List
      </button>
    </div>
  );
}
