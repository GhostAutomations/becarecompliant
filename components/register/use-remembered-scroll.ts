"use client";

/**
 * Be Care Compliant -- keep a board where the person left it.
 *
 * The DOM half of lib/ui/remembered-scroll.ts (which holds the rule, and its tests).
 * Mount it on any sideways-scrolling board: the People matrix, the Service User register,
 * the Training matrix. Phil, 2026-09-08, of walking back to the far left after every
 * record: "i click compliance again and the matrix is back to the left."
 *
 * Restored in a LAYOUT effect, before the browser paints, so the board is simply already
 * there rather than visibly sliding across after it appears.
 *
 * Storage is best effort throughout. sessionStorage throws outright in some privacy modes,
 * and a board that will not scroll to yesterday's column is a small thing next to a screen
 * that will not render at all.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  clampPosition,
  parsePosition,
  scrollKey,
  worthRemembering,
} from "@/lib/ui/remembered-scroll";

/** How long the scrolling has to stop before the position is written down. */
const SETTLE_MS = 150;

export function useRememberedScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  board: string,
) {
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(scrollKey(board));
    } catch {
      return;
    }
    const saved = parsePosition(raw);
    if (!saved) return;
    const pos = clampPosition(saved, {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    el.scrollLeft = pos.left;
    el.scrollTop = pos.top;
  }, [ref, board]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const remember = () => {
      const pos = { left: el.scrollLeft, top: el.scrollTop };
      try {
        const key = scrollKey(board);
        if (worthRemembering(pos)) window.sessionStorage.setItem(key, JSON.stringify(pos));
        else window.sessionStorage.removeItem(key);
      } catch {
        /* Storage refused. The board simply does not remember; nothing else is affected. */
      }
    };
    /* Written once the scrolling stops, not on every pixel of it. */
    const onScroll = () => {
      if (settleRef.current) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(remember, SETTLE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    /* Leaving for a record is a navigation, not an unload, so pagehide is the belt and
       braces for closing the tab or following a link out of the app mid-scroll. */
    window.addEventListener("pagehide", remember);
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", remember);
      remember();
    };
  }, [ref, board]);
}
