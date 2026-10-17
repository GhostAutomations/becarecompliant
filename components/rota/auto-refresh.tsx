"use client";

/**
 * Pushes the page again every minute while it is on screen (Rota and Visits Stage 7, the Today tab):
 * a visit turns late or overrunning with the clock, not with a change in the data, so the live
 * refresh alone would not catch it. A push, never a reload.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
