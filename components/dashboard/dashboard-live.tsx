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
 *  - since 2026-10-15 every tile comes from this person's saved copy (lib/dashboard/tiles.ts, 0482),
 *    so a push re-reads only the tiles the change affects;
 *  - at least MIN_GAP_MS between pushes, nothing while the tab is hidden, one push on coming back;
 *  - at each ten minute mark (:00, :10 ...) while it is being looked at, and straight away when the
 *    page opened on a copy older than the last mark, the whole copy is brought up to date, with
 *    the old figures on screen until the new ones arrive;
 *  - Refresh clears this person's snapshot and redraws quietly, with a small spinner.
 * The signal is the company's private live channel (0418, lib/realtime/live-bus.ts), joined only
 * once signed in; a poll stands in while the channel is down.
 */

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLiveTopic } from "@/components/live-topic";
import { rejoinLive, subscribeLive } from "@/lib/realtime/live-bus";
import { refreshDashboardFigures, requestDashboardRebuild } from "@/app/(app)/dashboard/actions";
import { msToNextSlot, slotStart } from "@/lib/dashboard/tiles";

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
  // The personal Recent activity tile (0473): the broadcast carries the table name only.
  "user_notifications",
  // The due tiles count training too, and the urgent follow ups come from the Out of Hours log
  // (2026-10-15: every tile is pushed when something it shows is done).
  "person_training",
  "training_courses",
  "on_call_logs",
];
const SETTLE_MS = 1_500;
const MIN_GAP_MS = 10_000;
const POLL_MS = 30_000;

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

export default function DashboardLive({ builtAt, copyOld = false }: { builtAt: string; copyOld?: boolean }) {
  const router = useRouter();
  const topic = useLiveTopic();
  const [pending, startTransition] = useTransition();
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => startTransition(() => router.refresh());
  /* THE TEN MINUTE MARK (Phil, 2026-10-15): bring the whole copy up to date. The action redraws the
     page in the same reply, inside a transition, so the figures on screen stay until the new ones
     arrive. */
  const rebuildRef = useRef<() => void>(() => {});
  rebuildRef.current = () =>
    startTransition(async () => {
      await requestDashboardRebuild();
    });

  /* A copy older than the last ten minute mark is shown at once, then brought up to date
     ("show it, then update"). */
  useEffect(() => {
    if (copyOld) rebuildRef.current();
  }, [copyOld, builtAt]);

  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    let lastRefresh = Date.now();
    // The ten minute slot this screen last brought the copy up to date in.
    let lastSlot = slotStart(Date.now());
    let timer: ReturnType<typeof setTimeout> | null = null;
    let markTimer: ReturnType<typeof setTimeout> | null = null;
    const atMark = () => {
      if (!visible()) return;
      const slot = slotStart(Date.now());
      if (slot <= lastSlot) return;
      lastSlot = slot;
      lastRefresh = Date.now();
      rebuildRef.current();
    };
    // Just after each :00, :10, :20 ..., spread over a few seconds so every open screen in a
    // company does not rebuild at the same instant.
    const scheduleMark = () => {
      markTimer = setTimeout(() => {
        atMark();
        scheduleMark();
      }, msToNextSlot(Date.now()) + 2_000 + Math.floor(Math.random() * 8_000));
    };
    scheduleMark();
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
      if (!connected) push();
    }, POLL_MS);

    const onVisible = () => {
      if (!visible()) return;
      if (topic && !connected) rejoinLive(topic);
      // Away past a ten minute mark: the whole copy; otherwise just what was done meanwhile.
      if (slotStart(Date.now()) > lastSlot) atMark();
      else push();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      if (markTimer) clearTimeout(markTimer);
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
