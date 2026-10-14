"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { s } from "./class-names";

/**
 * Be Care Compliant: plays one homepage story once, when it scrolls into view (Phil, 2026-10-14).
 *
 *  - The scene is server drawn in its FINAL state, so with reduced motion, no script, or before
 *    the page has woken up, the reader sees the finished picture and nothing ever moves.
 *  - Once the page is live, a story that is still below the screen is set to its opening frame
 *    ("armed"). When half of it is on screen it plays ("run"), once, then rests ("done").
 *  - A story that is already on screen when the page wakes up is left finished, with the replay
 *    control showing, so nobody sees a finished picture snap back to the start.
 *  - Scrolled away part way through, it pauses where it is and carries on when it is back.
 *  - The scene is aria-hidden: the invented names would be worse than silence read aloud. A
 *    short visually hidden sentence says what it shows.
 */
type State = "armed" | "run" | "done";

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
  const [paused, setPaused] = useState(false);
  const stateRef = useRef<State>("done");
  const timer = useRef<number | null>(null);
  const runStarted = useRef(0);
  const elapsed = useRef(0);

  function set(next: State) {
    stateRef.current = next;
    setState(next);
  }

  function finishIn(ms: number) {
    if (timer.current) window.clearTimeout(timer.current);
    runStarted.current = performance.now();
    timer.current = window.setTimeout(() => set("done"), ms);
  }

  function play() {
    elapsed.current = 0;
    set("run");
    finishIn(durationMs + 100);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
    if (!onScreen) set("armed");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const now = stateRef.current;
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (now === "armed") play();
            else if (now === "run" && timer.current === null) {
              // Back on screen part way through: carry on from where it paused.
              setPaused(false);
              finishIn(Math.max(0, durationMs + 100 - elapsed.current));
            }
          } else if (!e.isIntersecting && now === "run" && timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
            elapsed.current += performance.now() - runStarted.current;
            setPaused(true);
          }
        }
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function replay() {
    set("armed");
    // Two frames: the opening frame is drawn before the run starts, so every step plays again.
    requestAnimationFrame(() => requestAnimationFrame(() => play()));
  }

  return (
    <div ref={ref} className={`${s.story} ${className}`} data-state={state} data-paused={paused ? "true" : "false"}>
      <p className="sr-only">{label}</p>
      <div aria-hidden>{children}</div>
      <button
        type="button"
        className={s.replay}
        onClick={replay}
        tabIndex={state === "done" ? 0 : -1}
        aria-label="Replay this animation"
      >
        <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
        Replay
      </button>
    </div>
  );
}
