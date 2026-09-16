/**
 * Be Care Compliant — how far through a training PHASE somebody is.
 *
 * Phil, 2026-09-16, of the Monday board's Phase bars: "we need these."
 *
 * WHAT THE NUMBER MEANS. Of the phase's courses that belong to THIS person, the share that
 * are in date. A manager looking at a new starter asks "how far through are they", and thirty
 * three red and green cells do not answer it; one bar does.
 *
 * COUNTED AGAINST WHAT APPLIES TO THEM, not against the phase's full list. A course scoped to
 * supervisors is not a gap on a care assistant, so it must not drag her bar down; the same
 * rule the matrix and the scoring already use (courseAppliesToTitle).
 *
 * AMBER COUNTS AS IN DATE, red and missing do not. That matches how mandatory compliance and
 * the PQS measure are scored, so the bar cannot say one thing while the headline says another.
 *
 * NO COURSES IN THE PHASE FOR THIS PERSON RETURNS NULL, NOT 100%. An empty phase is not a
 * finished one, and a bar reading 100% because nothing was asked of them is the kind of green
 * that gets a company inspected.
 *
 * Pure and import free so it can be unit tested.
 */

export type PhaseProgress = { done: number; total: number; pct: number } | null;

export function phaseProgress(
  cells: ReadonlyArray<{ rag: string } | undefined>,
): PhaseProgress {
  const present = cells.filter((c): c is { rag: string } => !!c);
  if (present.length === 0) return null;
  const done = present.filter((c) => c.rag === "green" || c.rag === "amber").length;
  // ROUNDED DOWN, never up: 12 of 13 is 92%, and a bar that rounds to 100 before the last
  // course is done is a bar that lies on the day it matters most.
  return { done, total: present.length, pct: Math.floor((done / present.length) * 100) };
}
