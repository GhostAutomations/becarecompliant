"use client";

/**
 * Be Care Compliant: pages you have just visited come back at once (Phil, 2026-10-15, popup
 * "A and B now"; next.config staleTimes; docs/decisions/speed-plan.md).
 *
 * The browser now keeps a page you opened in the last five minutes (Phil, popup "5 minutes"), so
 * going back to it is instant. To be sure nothing done meanwhile is missed ("show it, then update",
 * the figures on screen staying until the new ones arrive):
 *  - back within 30 seconds: brought up to date only if something changed in the company since you
 *    left (this listens on the company's live channel the whole time);
 *  - back after longer: always quietly brought up to date, because some tables (Planner bookings,
 *    policies, invoicing) send no live signal.
 * Your own saves already clear the memory (revalidatePath), so they are never hidden.
 */

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLiveTopic } from "@/components/live-topic";
import { subscribeLive } from "@/lib/realtime/live-bus";

/** Keep in step with staleTimes.dynamic in next.config.ts. */
const REMEMBERED_MS = 5 * 60_000;
/** Back within this, a page is only refreshed if a live signal says something changed. */
const QUIET_MS = 30_000;

/** When the sidebar fetched a page by pointing at it (components/nav-link.tsx), so a page fetched
 *  minutes before it is opened is treated like a page left at that moment. */
const fetchedAt = new Map<string, number>();
export function notePageFetched(href: string) {
  // Pointing again at a page already remembered fetches nothing, so keep the first time.
  const now = Date.now();
  const prev = fetchedAt.get(href);
  if (prev === undefined || now - prev >= REMEMBERED_MS) fetchedAt.set(href, now);
}

export default function RouteMemory() {
  const pathname = usePathname();
  const router = useRouter();
  const topic = useLiveTopic();
  const [, startTransition] = useTransition();
  const lastChange = useRef(0);
  const leftAt = useRef(new Map<string, number>());
  const current = useRef<string | null>(null);

  useEffect(() => {
    if (!topic) return;
    return subscribeLive(topic, {
      onChange: () => {
        lastChange.current = Date.now();
      },
    });
  }, [topic]);

  useEffect(() => {
    const now = Date.now();
    const previous = current.current;
    if (previous && previous !== pathname) leftAt.current.set(previous, now);
    current.current = pathname;
    // The older of "left at" and "fetched at", so a page that might be out of date is refreshed.
    const known = [leftAt.current.get(pathname), fetchedAt.get(pathname)].filter((t): t is number => t !== undefined);
    const left = known.length ? Math.min(...known) : NaN;
    // Back on a remembered page: bring it up to date if it may be out of date.
    const away = Number.isFinite(left) ? now - left : Infinity;
    if (away < REMEMBERED_MS && (away >= QUIET_MS || lastChange.current > left)) {
      const t = setTimeout(() => startTransition(() => router.refresh()), 300);
      return () => clearTimeout(t);
    }
  }, [pathname, router]);

  return null;
}
