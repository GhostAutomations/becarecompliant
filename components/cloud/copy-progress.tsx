"use client";

/**
 * Live cloud drive progress (Phil 2026-10-09): the counts update on their own, and while copies are
 * waiting a bar shows how far through the run it is with the time left. Checks every 4 seconds while
 * copying, every 20 seconds otherwise (not at all while the tab is hidden), and refreshes the page once a run finishes so the failure
 * list is current.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CloudProgress } from "@/lib/cloud/progress";

function when(iso: string | null): string {
  if (!iso) return "Not yet";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function timeLeft(m: number | null): string {
  if (m == null) return "working out the time left";
  if (m <= 1) return "about a minute left";
  if (m < 60) return `about ${m} minutes left`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `about ${h} hour${h === 1 ? "" : "s"}${r ? ` ${r} minutes` : ""} left`;
}

export default function CopyProgress({ initial }: { initial: CloudProgress }) {
  const [p, setP] = useState(initial);
  const router = useRouter();
  const wasCopying = useRef(initial.waiting > 0);

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const tick = async () => {
      // Not looked at (another tab, a locked phone): no need to ask the server.
      if (document.hidden) {
        if (!stop) timer = window.setTimeout(tick, 20000);
        return;
      }
      try {
        const res = await fetch("/api/cloud/progress", { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as CloudProgress;
          if (!stop) {
            setP(next);
            if (wasCopying.current && next.waiting === 0) router.refresh();
            wasCopying.current = next.waiting > 0;
          }
        }
      } catch {
        // A missed check is fine; the next one catches up.
      }
      if (!stop) timer = window.setTimeout(tick, wasCopying.current ? 4000 : 20000);
    };
    timer = window.setTimeout(tick, initial.waiting > 0 ? 4000 : 20000);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [initial.waiting, router]);

  const copying = p.waiting > 0;
  const total = Math.max(p.runTotal, p.runDone + p.waiting);
  const pct = total > 0 ? Math.min(100, Math.round((p.runDone / total) * 100)) : 0;

  return (
    <div className="space-y-3">
      {copying ? (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-white">
              Copying {p.runDone.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}
            </span>
            <span className="text-white/60">{timeLeft(p.minutesLeft)}</span>
          </div>
          <span
            className="block h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={p.runDone}
            aria-label={`${p.runDone} of ${total} copied`}
          >
            <span className="block h-full rounded-full bg-gold-400 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <span className="pill pill-neutral">Last copy: {when(p.lastCopiedAt)}</span>
        <span className="pill pill-neutral">{p.copied30d.toLocaleString("en-GB")} copied in the last 30 days</span>
        <span className={copying ? "pill pill-amber" : "pill pill-neutral"}>{p.waiting.toLocaleString("en-GB")} waiting</span>
        <span className={p.failed > 0 ? "pill pill-red" : "pill pill-green"}>{p.failed} failed</span>
      </div>
    </div>
  );
}
