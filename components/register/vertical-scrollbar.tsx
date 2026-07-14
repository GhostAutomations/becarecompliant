"use client";

/**
 * Be Care Compliant — shared permanent vertical scrollbar, the up/down twin of
 * HorizontalScrollbar. Native scrollbars are hidden by macOS/Edge overlay settings,
 * so we render our own and sync it to a scroll container. Draggable thumb +
 * click-to-jump track. Sits to the right of a matrix wrap.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function VerticalScrollbar({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);
  const [thumb, setThumb] = useState({ height: 0, top: 0, visible: false });

  const update = useCallback(() => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.visible ? { height: 0, top: 0, visible: false } : t));
      return;
    }
    const trackH = track.clientHeight;
    const height = Math.max(40, (clientHeight / scrollHeight) * trackH);
    const maxScroll = scrollHeight - clientHeight;
    const top = maxScroll > 0 ? (scrollTop / maxScroll) * (trackH - height) : 0;
    setThumb({ height, top, visible: true });
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
      const trackH = track.clientHeight;
      const thumbH = Math.max(40, (el.clientHeight / el.scrollHeight) * trackH);
      const maxScroll = el.scrollHeight - el.clientHeight;
      const span = trackH - thumbH;
      const ratio = span > 0 ? (e.clientY - dragRef.current.startY) / span : 0;
      el.scrollTop = Math.min(maxScroll, Math.max(0, dragRef.current.startTop + ratio * maxScroll));
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
      className="relative w-3.5 shrink-0 rounded-full bg-white/10"
      style={{ visibility: thumb.visible ? "visible" : "hidden" }}
      onPointerDown={(e) => {
        const el = targetRef.current;
        const track = trackRef.current;
        if (!el || !track || e.target !== track) return;
        const rect = track.getBoundingClientRect();
        const maxScroll = el.scrollHeight - el.clientHeight;
        el.scrollTop = ((e.clientY - rect.top) / rect.height) * maxScroll;
      }}
    >
      <div
        className="absolute left-0 w-3.5 cursor-grab rounded-full bg-white/40 hover:bg-white/60 active:cursor-grabbing"
        style={{ height: `${thumb.height}px`, transform: `translateY(${thumb.top}px)` }}
        onPointerDown={(e) => {
          const el = targetRef.current;
          if (!el) return;
          dragRef.current = { startY: e.clientY, startTop: el.scrollTop };
          document.body.style.userSelect = "none";
        }}
      />
    </div>
  );
}
