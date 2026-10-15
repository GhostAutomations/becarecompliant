"use client";

/**
 * Be Care Compliant: pages you have just visited come back at once (Phil, 2026-10-15, popup
 * "A and B now"; next.config staleTimes; docs/decisions/speed-plan.md).
 *
 * The browser now keeps a page you opened in the last 30 seconds, so going back to it is instant.
 * To be sure nothing done meanwhile is missed, this listens on the company's live channel the whole
 * time and notes when anything last changed. Coming back to a remembered page, if something has
 * changed since you left it, the page is quietly brought up to date ("show it, then update"), the
 * figures on screen staying until the new ones arrive. Your own saves already clear the memory
 * (revalidatePath), so they are never hidden.
 */

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLiveTopic } from "@/components/live-topic";
import { subscribeLive } from "@/lib/realtime/live-bus";

/** Keep in step with staleTimes.dynamic in next.config.ts. */
const REMEMBERED_MS = 30_000;

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
    const left = leftAt.current.get(pathname);
    // Back within the remembered time, and something changed since: bring it up to date.
    if (left !== undefined && now - left < REMEMBERED_MS && lastChange.current > left) {
      const t = setTimeout(() => startTransition(() => router.refresh()), 300);
      return () => clearTimeout(t);
    }
  }, [pathname, router]);

  return null;
}
