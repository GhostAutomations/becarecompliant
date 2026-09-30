"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const BEAT_MS = 30_000;
const IDLE_MS = 60_000;

/* ACTIVE TIME ONLY (Phil, popup 2026-09-30). Rendered only inside a demo. Counts time while the
   tab is visible and somebody has moved, typed, scrolled or tapped in the last minute; a tab left
   open overnight counts nothing. Each beat says how long since the last one and which page. */
export default function DemoHeartbeat() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const lastInput = useRef(Date.now());
  const lastBeat = useRef(Date.now());

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const touch = () => {
      lastInput.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const send = (seconds: number) =>
      fetch("/api/demo/beat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathRef.current, seconds }),
        keepalive: true,
      }).catch(() => undefined);

    // Opens the visit (this sign in) straight away.
    send(0);
    lastBeat.current = Date.now();

    const timer = window.setInterval(() => {
      const now = Date.now();
      const since = Math.round((now - lastBeat.current) / 1000);
      lastBeat.current = now;
      const active = document.visibilityState === "visible" && now - lastInput.current < IDLE_MS;
      if (active) send(Math.min(60, since));
    }, BEAT_MS);

    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, []);

  return null;
}
