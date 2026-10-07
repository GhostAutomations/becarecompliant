"use client";

/**
 * Be Care Compliant: the dashboard's live updates and quiet refresh (Phil, 2026-10-07).
 *
 * "a push in the background to change something but not change the whole page ... nine items
 * overdue ... changes to eight ... because of a push, not because of a refresh ... a small refresh
 * button in the top of the dash ... quiet refresh".
 *
 * One listener replaces the three RealtimeRefresh components the dashboard used to mount. Each of
 * those re-rendered the whole page, every slow engine included, as often as every three seconds a
 * tab. Now:
 *  - a change to anything the live tiles count settles for a moment, then router.refresh() runs in
 *    a transition, so React swaps only the numbers that moved and nothing flashes;
 *  - the slow figures come from the ten minute snapshot on the server, so a push only re-reads the
 *    quick tiles;
 *  - at least MIN_GAP_MS between pushes, nothing while the tab is hidden, one push on coming back;
 *  - every ten minutes while it is being looked at, a refresh picks up the new snapshot;
 *  - Refresh clears this person's snapshot and redraws quietly, with a small spinner.
 * The signal is the company's private live channel (0418, lib/realtime/live-bus.ts), joined only
 * once signed in; a poll stands in while the channel is down.
 */

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLiveTopic } from "@/components/live-topic";
import { rejoinLive, subscribeLive } from "@/lib/realtime/live-bus";
import { refreshDashboardFigures } from "@/app/(app)/dashboard/actions";

const TABLES = [
  "people",
  "check_instances",
  "person_trackers",
  "service_users",
  "service_user_trackers",
  "rtw_questionnaires",
  "absence_events",
  "absence_meetings",
  "holiday_requests",
  "complaints",
  "incidents",
];
const SETTLE_MS = 1_500;
const MIN_GAP_MS = 10_000;
const POLL_MS = 30_000;
const SNAPSHOT_MS = 10 * 60 * 1000;

function timeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export default function DashboardLive({ builtAt }: { builtAt: string }) {
  const router = useRouter();
  const topic = useLiveTopic();
  const [pending, startTransition] = useTransition();
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => startTransition(() => router.refresh());

  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    let lastRefresh = Date.now();
    let lastFull = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshNow = () => {
      timer = null;
      if (!visible()) return;
      lastRefresh = Date.now();
      refreshRef.current();
    };
    const push = () => {
      if (!visible() || timer) return;
      const wait = Math.max(SETTLE_MS, lastRefresh + MIN_GAP_MS - Date.now());
      timer = setTimeout(refreshNow, wait);
    };

    /* BROADCAST (speed plan push 2): one small "table changed" message per company on a private
       channel (0418), through the shared listener, in place of row level subscriptions. */
    let connected = false;
    const watched = new Set(TABLES);
    const stop = topic
      ? subscribeLive(topic, {
          onChange: (table) => {
            if (watched.has(table)) push();
          },
          onStatus: (c) => {
            connected = c;
          },
        })
      : () => {};

    const interval = setInterval(() => {
      if (!visible()) return;
      // Ten minutes on: pick up the new snapshot.
      if (Date.now() - lastFull >= SNAPSHOT_MS) {
        lastFull = Date.now();
        push();
        return;
      }
      if (!connected) push();
    }, POLL_MS);

    const onVisible = () => {
      if (!visible()) return;
      if (topic && !connected) rejoinLive(topic);
      push();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      stop();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [topic]);

  const label = timeLabel(builtAt);
  return (
    <div className="flex items-center gap-1 text-xs text-white/60">
      {label ? <span aria-live="polite">Figures from {label}</span> : null}
      <button
        type="button"
        className="btn-ghost btn-xs"
        aria-label="Refresh the dashboard figures"
        title="Refresh"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await refreshDashboardFigures();
            router.refresh();
          })
        }
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
          aria-hidden="true"
        >
          <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" strokeLinecap="round" />
          <path d="M16.5 3.5v3.5H13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
