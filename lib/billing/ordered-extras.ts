/**
 * WHAT THEY ORDERED IS THE LEAST THEY PAY FOR (Phil, 2026-09-30, by popup, after test I3).
 *
 * The accept screen asks how many extra users and extra branches a company needs, and the total
 * they accept includes them. Billing used to count only the users and branches that actually
 * exist, so a company that ordered 1 extra user while it still had 3 people accepted £840 a year
 * and was sent to Stripe for £790. The agreed total and the charge must always match.
 *
 * The rule: the extras billed are the larger of what exists now and what the latest accepted
 * Order says. Adding people beyond the Order is charged as before; nothing drops below the Order
 * until the company accepts a new one. Pure, so every place that bills or shows extras uses the
 * same arithmetic.
 */

export type OrderedExtras = { users: number; branches: number };

export const NO_ORDERED_EXTRAS: OrderedExtras = { users: 0, branches: 0 };

function wholeOrZero(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Ordered extras from an acceptance row. A missing row, a Black account (nulls) or anything
 *  malformed counts as nothing ordered, which fails towards charging only what exists. */
export function orderedExtrasFrom(
  row: { extra_users?: number | null; extra_branches?: number | null } | null | undefined,
): OrderedExtras {
  if (!row) return NO_ORDERED_EXTRAS;
  return { users: wholeOrZero(row.extra_users), branches: wholeOrZero(row.extra_branches) };
}

/** The quantity to bill: whichever is larger, what exists or what was ordered. Never negative. */
export function billedExtra(actualExtra: number, orderedExtra: number): number {
  return Math.max(wholeOrZero(actualExtra), wholeOrZero(orderedExtra));
}
