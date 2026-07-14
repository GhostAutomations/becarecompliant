"use client";

import { useState } from "react";

/**
 * The gold star next to a PQS measure. Shows its question instantly on hover
 * (native title tooltips lag by seconds). Fixed positioning so it is never
 * clipped by the table's scroll container, and follows the cursor.
 */
export default function StarTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      className="relative ml-1 cursor-help text-gold-300"
      aria-label={text}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      ★
      {pos ? (
        <span
          className="pointer-events-none fixed z-[200] w-64 -translate-x-1/2 -translate-y-full rounded-md bg-navy-950 px-2 py-1.5 text-xs font-normal leading-snug text-white/90 shadow-xl ring-1 ring-white/10"
          style={{ left: pos.x, top: pos.y - 10 }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
