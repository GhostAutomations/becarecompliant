"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fades and lifts its children into view once, when scrolled to. Falls back to
 *  visible if IntersectionObserver is unavailable or reduced motion is set. */
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      /**
       * Arm the reveal BEFORE the section reaches the viewport, not after.
       *
       * It used to wait until 12 percent of the element was already 8 percent inside the
       * screen, then fade for six tenths of a second from fully transparent. Scrolling at a
       * normal speed you caught whole sections sitting at about a third opacity, unreadable.
       * A positive bottom margin arms it a fifth of a screen early and a zero threshold fires
       * on the first pixel, so by the time anyone is looking at it, it has arrived.
       */
      { threshold: 0, rootMargin: "0px 0px 20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
