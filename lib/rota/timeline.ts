/**
 * Be Care Compliant: the timeline views' maths (Rota and Visits Stage 5b, Phil's popups 2026-10-16;
 * docs/decisions/rota-visits.md, Stage 5b). Importless, so node --test runs it.
 *
 * A day is 1,440 minutes across. Blocks that overlap in one row are laid out in lanes, one under
 * another, so nothing hides. Dragging snaps to 5 minutes; a visit stays on its own day.
 */

export const DAY_MINUTES = 1440;
export const SNAP_MINUTES = 5;
/** Late once 15 minutes past the start with nobody clocked in (Stage 0 decision: the late alert). */
export const LATE_AFTER_MINUTES = 15;

/** "08:30" or "08:30:00" to 510. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 510 to "08:30". */
export function fromMinutes(min: number): string {
  const m = ((Math.round(min) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function snap(min: number, step = SNAP_MINUTES): number {
  return Math.round(min / step) * step;
}

/**
 * Where a dragged block may start: snapped to 5 minutes, never before midnight, and never so late
 * that it runs past the end of its day.
 */
export function dragStart(originalStart: number, deltaMinutes: number, length: number): number {
  const s = snap(originalStart + deltaMinutes);
  return Math.max(0, Math.min(DAY_MINUTES - length, s));
}

export type LaneBlock = { id: string; start: number; end: number };

/** Each block's lane in its row: the first lane where it does not overlap an earlier block. */
export function lanes<T extends LaneBlock>(blocks: T[]): { lane: Map<string, number>; count: number } {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const b of sorted) {
    let i = ends.findIndex((e) => e <= b.start);
    if (i === -1) {
      i = ends.length;
      ends.push(b.end);
    } else {
      ends[i] = b.end;
    }
    lane.set(b.id, i);
  }
  return { lane, count: Math.max(1, ends.length) };
}

export type VisitTone = "done" | "in_progress" | "late" | "due" | "draft" | "paused" | "cancelled";

/**
 * How a visit block looks: done once clocked out, in progress once clocked in, late once 15
 * minutes past the start with nobody clocked in, otherwise due (or draft, paused).
 */
export function visitTone(v: {
  status: string;
  paused: boolean;
  startsAtMs: number;
  nowMs: number;
  clockedIn: boolean;
  clockedOut: boolean;
  /** The company's Settings, Rota late time (0509); 15 minutes when not given. */
  lateAfterMin?: number;
}): VisitTone {
  if (v.status === "cancelled") return "cancelled";
  if (v.paused) return "paused";
  if (v.clockedOut) return "done";
  if (v.clockedIn) return "in_progress";
  if (v.status === "draft") return "draft";
  if (v.nowMs > v.startsAtMs + (v.lateAfterMin ?? LATE_AFTER_MINUTES) * 60_000) return "late";
  return "due";
}

/** "12 min late", "5 min early", "on time" for a clock in against the start; null when not clocked in. */
export function clockInWords(startsAtMs: number, clockInMs: number | null): string | null {
  if (clockInMs == null) return null;
  const diff = Math.round((clockInMs - startsAtMs) / 60_000);
  if (diff > 0) return `${diff} min late`;
  if (diff < 0) return `${-diff} min early`;
  return "on time";
}

/** Monday of the week a date falls in (YYYY-MM-DD), and the seven dates from it. */
export function weekDates(dateIso: string): string[] {
  const d = new Date(`${dateIso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

/** A block on a timeline: a visit's progress, or a shift, or a Care Schedule call. */
export type BlockTone = VisitTone | "shift" | "call";

/** What each look means, for the key under a timeline and each block's description. */
export const TONE_WORDS: Record<BlockTone, string> = {
  done: "Done",
  in_progress: "In progress",
  late: "Late, nobody clocked in",
  due: "Due",
  draft: "Not published",
  paused: "Paused (hospital or away)",
  cancelled: "Cancelled",
  shift: "Shift",
  call: "Call",
};
