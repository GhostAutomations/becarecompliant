import type { CSSProperties } from "react";

/** When a step starts in its story (and, for a card that visits, how long it stays). Kept out of
 *  the client player so the server drawn scenes can call it. */
export function d(ms: number, len?: number): CSSProperties {
  return { ["--d" as string]: `${ms}ms`, ...(len ? { ["--len" as string]: `${len}ms` } : {}) };
}
