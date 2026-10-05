"use client";

import { useEffect } from "react";

/* SIGNED OUT ON ITS OWN (Phil, popup 2026-10-05: Bev signed in in Chrome and the Edge tab still
   looked signed in). The server already ends a displaced session; this makes an open tab notice
   without being clicked. It asks /api/session/check when the tab comes back into view and once a
   minute while it is visible, never while hidden. If the answer is the sign in page, the tab goes
   there, carrying the reason the server gave (so "You've been signed out because your account
   was signed in elsewhere" shows) and the page the person was on. A network blip changes nothing. */
const EVERY_MS = 60_000;
const MIN_GAP_MS = 10_000;

export default function SessionWatch() {
  useEffect(() => {
    let last = 0;
    let busy = false;

    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      if (Date.now() - last < MIN_GAP_MS) return;
      busy = true;
      last = Date.now();
      try {
        const res = await fetch("/api/session/check", { cache: "no-store", credentials: "same-origin" });
        const landed = new URL(res.url, window.location.origin);
        if (res.redirected && landed.pathname === "/login") {
          landed.searchParams.set("next", window.location.pathname);
          window.location.assign(landed.pathname + landed.search);
        }
      } catch {
        /* Offline or a dropped request: try again on the next tick. */
      } finally {
        busy = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => void check(), EVERY_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
