"use client";

/**
 * Be Care Compliant: the timeline (Rota and Visits Stage 5b, Phil's popups 2026-10-16;
 * docs/decisions/rota-visits.md, Stage 5b). Rows down the side, a 24 hour line across, each visit,
 * shift or call a block. Shared by Carer day, Service user day and the service user's week views.
 *
 * Tapping a block opens it. Where the page allows it, a block can be dragged with a mouse onto
 * another row (another carer) or along the line (a new start time, in 5 minute steps); on a phone
 * the line scrolls sideways and a tap opens the visit. Nothing changes until the page has asked
 * and the server has checked every rule.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_MINUTES, TONE_WORDS, dragStart, fromMinutes, lanes, type BlockTone } from "@/lib/rota/timeline";

export type { BlockTone };

export type TimelineBlock = {
  id: string;
  start: number; // minutes from midnight
  end: number;
  label: string;
  /** A second line: a clock in, "No time set", and so on. */
  sublabel?: string;
  tone: BlockTone;
  /** Shown on hover and read out: the full detail in words. */
  title: string;
  href?: string;
  draggable?: boolean;
};

export type TimelineRow = {
  key: string;
  label: string;
  sublabel?: string;
  href?: string;
  blocks: TimelineBlock[];
  /** A dragged block may be dropped on this row. */
  droppable?: boolean;
  /** Today, on a week view. */
  highlight?: boolean;
};

export type TimelineDrop = { block: TimelineBlock; fromRow: string; toRow: string; newStart: number };

const PX = 2; // pixels per minute: a 30 minute visit is 60 pixels, wide enough for a name
const LABEL_W = 168;
const LANE_H = 30;

const TONE_CLASS: Record<BlockTone, string> = {
  done: "bg-emerald-700 text-white border-emerald-400/60",
  in_progress: "bg-amber-500 text-navy-950 border-amber-300",
  late: "bg-red-600 text-white border-red-300",
  due: "bg-slate-600 text-white border-slate-400/60",
  draft: "bg-white/10 text-white/80 border-dashed border-white/40",
  paused: "bg-white/5 text-white/45 border-white/15",
  cancelled: "bg-white/5 text-white/30 border-white/10 line-through",
  shift: "bg-indigo-700/80 text-white border-indigo-300/50",
  call: "bg-amber-700/80 text-white border-amber-400/60",
};


export default function Timeline({
  rows,
  labelHeader,
  nowMinute,
  onDrop,
  emptyText,
  legend,
}: {
  rows: TimelineRow[];
  labelHeader: string;
  /** Today: a red line at this minute. */
  nowMinute?: number | null;
  onDrop?: (d: TimelineDrop) => void;
  emptyText: string;
  legend: BlockTone[];
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ block: TimelineBlock; row: string; x0: number; y0: number; dx: number; dy: number } | null>(null);
  // Set when a mouse press began a drag: the pointer up then decides (open, move or nothing), so the
  // click that follows is ignored. A tap with a finger never sets it, so the click opens the visit.
  const dragBegan = useRef(false);

  // Open at the part of the day that matters: an hour before now, else the first block, else 06:00.
  useEffect(() => {
    const first = Math.min(...rows.flatMap((r) => r.blocks.map((b) => b.start)), Number.POSITIVE_INFINITY);
    const focus = nowMinute != null ? nowMinute - 60 : Number.isFinite(first) ? first - 30 : 360;
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, focus * PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A mouse drag. The listeners go on the window the moment the button goes down (not after the
     next redraw), so even a quick flick of the mouse is followed to where it is let go. */
  function startDrag(block: TimelineBlock, row: string, x0: number, y0: number) {
    dragBegan.current = true;
    setDrag({ block, row, x0, y0, dx: 0, dy: 0 });
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, dx: e.clientX - x0, dy: e.clientY - y0 } : d));
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setDrag(null);
      // The click that follows this pointer up (if any) comes first; then the flag is cleared.
      setTimeout(() => {
        dragBegan.current = false;
      }, 0);
      const moved = Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0);
      if (moved < 5) {
        if (block.href) router.push(block.href);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-row-key]") as HTMLElement | null;
      const toRow = el?.dataset.rowKey ?? row;
      const droppable = el?.dataset.droppable === "true";
      if (toRow !== row) {
        // Onto another carer: the time stays as it is.
        if (droppable) onDrop?.({ block, fromRow: row, toRow, newStart: block.start });
        return;
      }
      const newStart = dragStart(block.start, (e.clientX - x0) / PX, block.end - block.start);
      if (newStart !== block.start) onDrop?.({ block, fromRow: row, toRow, newStart });
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setDrag(null);
      dragBegan.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  const width = DAY_MINUTES * PX;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="space-y-2">
      <div ref={scroller} className="overflow-x-auto rounded-xl border border-white/10 bg-navy-900/60">
        <div style={{ width: LABEL_W + width }} className="relative select-none">
          {/* The hours across the top. */}
          <div className="sticky top-0 z-20 flex border-b border-white/10 bg-navy-900">
            <div style={{ width: LABEL_W }} className="sticky left-0 z-30 shrink-0 bg-navy-900 px-3 py-2 text-xs font-semibold text-white/60">
              {labelHeader}
            </div>
            <div className="relative h-8" style={{ width }}>
              {hours.map((h) => (
                <span key={h} className="absolute top-2 text-[11px] text-white/45" style={{ left: h * 60 * PX + 3 }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>

          {rows.length === 0 ? <p className="sticky left-0 p-4 text-sm text-white/55">{emptyText}</p> : null}

          {rows.map((r) => {
            const { lane, count } = lanes(r.blocks);
            const height = count * LANE_H + 10;
            return (
              <div
                key={r.key}
                data-row-key={r.key}
                data-droppable={r.droppable ? "true" : "false"}
                className={`flex border-b border-white/5 ${r.highlight ? "bg-amber-500/10" : ""} ${drag && r.droppable && drag.row !== r.key ? "hover:bg-white/10" : ""}`}
              >
                <div style={{ width: LABEL_W, minHeight: height }} className={`sticky left-0 z-10 shrink-0 px-3 py-1.5 ${r.highlight ? "bg-navy-800" : "bg-navy-900"}`}>
                  {r.href ? (
                    <a href={r.href} className="block truncate text-xs font-semibold text-white hover:underline">
                      {r.label}
                    </a>
                  ) : (
                    <span className="block truncate text-xs font-semibold text-white">{r.label}</span>
                  )}
                  {r.sublabel ? <span className="block truncate text-[11px] text-white/50">{r.sublabel}</span> : null}
                </div>
                <div className="relative" style={{ width, height }}>
                  {hours.map((h) => (
                    <span key={h} className="absolute inset-y-0 border-l border-white/5" style={{ left: h * 60 * PX }} aria-hidden="true" />
                  ))}
                  {nowMinute != null ? (
                    <span className="absolute inset-y-0 z-10 w-px bg-red-500" style={{ left: nowMinute * PX }} aria-hidden="true" />
                  ) : null}
                  {r.blocks.map((b) => {
                    const dragging = drag?.block.id === b.id;
                    const style = {
                      left: b.start * PX,
                      width: Math.max(40, (b.end - b.start) * PX),
                      top: 5 + (lane.get(b.id) ?? 0) * LANE_H,
                      height: LANE_H - 4,
                      transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                    };
                    const cls = `absolute z-[5] overflow-hidden rounded-md border px-1.5 text-left leading-tight ${TONE_CLASS[b.tone]} ${
                      dragging ? "z-40 opacity-90 shadow-lg ring-2 ring-amber-300" : ""
                    } ${b.draggable && onDrop ? "cursor-grab" : b.href ? "cursor-pointer" : ""}`;
                    const inner = (
                      <>
                        <span className="block truncate text-[11px] font-semibold">{b.label}</span>
                        {b.sublabel ? <span className="block truncate text-[10px] opacity-80">{b.sublabel}</span> : null}
                      </>
                    );
                    return (
                      <button
                        key={b.id}
                        type="button"
                        title={b.title}
                        aria-label={b.title}
                        className={cls}
                        style={style}
                        onPointerDown={(e) => {
                          // A mouse or pen drags; a finger scrolls the line and taps to open.
                          if (!b.draggable || !onDrop || e.pointerType === "touch" || e.button !== 0) return;
                          e.preventDefault();
                          startDrag(b, r.key, e.clientX, e.clientY);
                        }}
                        onClick={() => {
                          if (dragBegan.current) {
                            dragBegan.current = false; // the pointer up already handled it
                            return;
                          }
                          if (b.href) router.push(b.href);
                        }}
                      >
                        {inner}
                      </button>
                    );
                  })}
                  {drag && drag.row === r.key && Math.abs(drag.dx) > 4 && Math.abs(drag.dy) < LANE_H ? (
                    <span className="absolute -top-0.5 z-50 rounded bg-amber-400 px-1 text-[10px] font-semibold text-navy-950" style={{ left: (drag.block.start + drag.dx / PX) * PX }}>
                      {fromMinutes(dragStart(drag.block.start, drag.dx / PX, drag.block.end - drag.block.start))}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="flex flex-wrap gap-3 text-[11px] text-white/60" aria-label="Key">
        {legend.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded border ${TONE_CLASS[t]}`} aria-hidden="true" />
            {TONE_WORDS[t]}
          </li>
        ))}
      </ul>
    </div>
  );
}
