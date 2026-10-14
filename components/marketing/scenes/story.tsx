"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { s } from "./class-names";

/**
 * Be Care Compliant: plays one homepage story, on a loop while it is on screen (Phil, 2026-10-14:
 * first "plays once, with a replay control", then, having seen it, "Loop while on screen").
 *
 *  - The scene is server drawn in its FINAL state, so with reduced motion, no script, or before
 *    the page has woken up, the reader sees the finished picture and nothing ever moves.
 *  - Once at least a third of it is on screen it plays: the opening frame fades in, each step
 *    runs, the finished picture holds for HOLD_MS, it fades out, and the story starts again.
 *  - Scrolled away, every timer stops and it rests on the finished picture. Back on screen, it
 *    starts again from the beginning. Nothing is ever left part way through (the first version
 *    paused mid story when scrolled away, which could leave the form card showing).
 *  - The scene is aria-hidden: the invented names would be worse than silence read aloud. A
 *    short visually hidden sentence says what it shows.
 */
type State = "done" | "fadeOut" | "armed" | "run";

const HOLD_MS = 4000;
const FADE_MS = 300;

export default function Story({
  label,
  durationMs,
  children,
  className = "",
}: {
  /** What the scene shows, for a screen reader. */
  label: string;
  /** When the last step has finished. */
  durationMs: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("done");
  const timers = useRef<number[]>([]);
  const frames = useRef<number[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;

    const clearAll = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      frames.current.forEach((f) => cancelAnimationFrame(f));
      timers.current = [];
      frames.current = [];
    };
    const later = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    // One pass: fade the finished picture out, draw the opening frame, play, hold, go again.
    const cycle = () => {
      if (!visible) return;
      setState("fadeOut");
      later(() => {
        setState("armed");
        // Two frames: the opening frame is drawn (and faded in) before the steps start.
        frames.current.push(
          requestAnimationFrame(() =>
            frames.current.push(
              requestAnimationFrame(() => {
                setState("run");
                later(() => {
                  setState("done");
                  later(cycle, HOLD_MS);
                }, durationMs + 100);
              }),
            ),
          ),
        );
      }, FADE_MS);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const nowVisible = e.isIntersecting && e.intersectionRatio >= 0.33;
          if (nowVisible && !visible) {
            visible = true;
            cycle();
          } else if (!e.isIntersecting && visible) {
            // Gone from the screen: stop, and rest on the finished picture.
            visible = false;
            clearAll();
            setState("done");
          }
        }
      },
      { threshold: [0, 0.33] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearAll();
    };
  }, [durationMs]);

  return (
    <div ref={ref} className={`${s.story} ${className}`} data-state={state}>
      <p className="sr-only">{label}</p>
      <div aria-hidden className={s.stage}>
        {children}
      </div>
    </div>
  );
}
