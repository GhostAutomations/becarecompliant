"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * The gold star next to a PQS measure. Shows its question instantly on hover
 * (native title tooltips lag by seconds). The tooltip is portalled to <body> and
 * fixed to the cursor, so it is never clipped by the table's scroll container or
 * offset by a transformed ancestor.
 */
export default function StarTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      className="ml-1 cursor-help text-gold-300"
      aria-label={text}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      ★
      {pos && typeof document !== "undefined"
        ? createPortal(
            <span
              className="pointer-events-none fixed z-[9999] w-64 -translate-x-1/2 -translate-y-full rounded-md bg-navy-950 px-2 py-1.5 text-xs font-normal leading-snug text-white/90 shadow-xl ring-1 ring-white/10"
              style={{ left: pos.x, top: pos.y - 10 }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
