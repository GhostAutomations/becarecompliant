"use client";

/**
 * Be Care Compliant — shared permanent horizontal scrollbar for the registers. We
 * render it ourselves and sync it to a scroll container, because native scrollbars
 * are hidden by macOS/Edge overlay settings. Draggable thumb + click-to-jump track.
 * Used by both the People matrix and the Service User register.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function HorizontalScrollbar({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, visible: false });

  const update = useCallback(() => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth + 1) {
      setThumb((t) => (t.visible ? { width: 0, left: 0, visible: false } : t));
      return;
    }
    const trackW = track.clientWidth;
    const width = Math.max(40, (clientWidth / scrollWidth) * trackW);
    const maxScroll = scrollWidth - clientWidth;
    const left = maxScroll > 0 ? (scrollLeft / maxScroll) * (trackW - width) : 0;
    setThumb({ width, left, visible: true });
  }, [targetRef]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update, targetRef]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const el = targetRef.current;
      const track = trackRef.current;
      if (!dragRef.current || !el || !track) return;
      const trackW = track.clientWidth;
      const thumbW = Math.max(40, (el.clientWidth / el.scrollWidth) * trackW);
      const maxScroll = el.scrollWidth - el.clientWidth;
      const span = trackW - thumbW;
      const ratio = span > 0 ? (e.clientX - dragRef.current.startX) / span : 0;
      el.scrollLeft = Math.min(maxScroll, Math.max(0, dragRef.current.startLeft + ratio * maxScroll));
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [targetRef]);

  return (
    <div
      ref={trackRef}
      className="relative h-2 w-full shrink-0 rounded-full bg-white/10"
      style={{ visibility: thumb.visible ? "visible" : "hidden" }}
      onPointerDown={(e) => {
        const el = targetRef.current;
        const track = trackRef.current;
        if (!el || !track || e.target !== track) return;
        const rect = track.getBoundingClientRect();
        const maxScroll = el.scrollWidth - el.clientWidth;
        el.scrollLeft = ((e.clientX - rect.left) / rect.width) * maxScroll;
      }}
    >
      <div
        className="absolute top-0 h-2 cursor-grab rounded-full bg-white/40 hover:bg-white/60 active:cursor-grabbing"
        style={{ width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` }}
        onPointerDown={(e) => {
          const el = targetRef.current;
          if (!el) return;
          dragRef.current = { startX: e.clientX, startLeft: el.scrollLeft };
          document.body.style.userSelect = "none";
        }}
      />
    </div>
  );
}
