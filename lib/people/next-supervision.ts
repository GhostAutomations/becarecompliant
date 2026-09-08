/**
 * Be Care Compliant — which supervision is the next one.
 *
 * WHY IT IS ITS OWN MODULE (Phil, 2026-09-08): "if i click the task in the planner there
 * is a question Which supervision, why does it not know? it should [be] the same as if i
 * am clicking the supervision from the name card."
 *
 * Supervisions are sequential: the next one to complete is the first slot with no
 * completion against it. The record card has always known that -- it is why only one of
 * the three tiles offers a Complete button -- but it knew it as a line of code inside a
 * page, and passed the answer along in the URL. Anything arriving without that URL (the
 * planner, a bookmark, a link in an email) fell through to asking the person which
 * supervision they were doing, which is both a question the system can answer and a
 * chance to record the wrong one.
 *
 * One rule, in one place, so the record card and the form can never disagree about which
 * supervision is next. Pure and self-contained (no imports) so it can be unit tested.
 */

/** The only shape this module needs from a supervision slot. */
export type SlotLike = { n: number; comp: string | null };

/**
 * The number of the next supervision to complete, or null when they are all done.
 *
 * "Done" means a completion date is recorded against the slot. A slot that is overdue,
 * or not yet due, is still the next one: this answers WHICH, never WHETHER.
 */
export function nextSupervisionNumber(slots: ReadonlyArray<SlotLike>): number | null {
  return slots.find((s) => !s.comp)?.n ?? null;
}
