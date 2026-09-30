/**
 * Be Care Compliant — the monthly subscription total, in one place.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so it is unit testable and every screen that quotes a price
 * quotes the same one.
 *
 * WHY IT EXISTS. The total was computed independently on the customer billing page and on the
 * founder company page. When extra branches started being charged, the customer page was
 * updated and the founder page was not, so the founder console reported Acme at £69.00 a
 * month while Stripe was billing £84.00. Nothing was broken in either file on its own; the
 * defect was that there were two files.
 *
 * EVERY COMPONENT IS A REQUIRED FIELD. That is the whole point: adding a fourth charge means
 * the compiler stops at every call site, instead of one screen silently under-reporting.
 */

export type MonthlyTotalInput = {
  /** The tier's base price in pence. Zero for tiers that do not use a subscription. */
  basePence: number;
  /** Users beyond the tier's allowance. */
  extraSeats: number;
  /** Price per extra user per month, in pence. */
  seatPence: number;
  /** Operational branches beyond the tier's allowance. */
  extraBranches: number;
  /** Price per extra branch per month, in pence. */
  branchPence: number;
};

/** Base + extra seats + extra branches, in pence. Never negative, never NaN. */
export function subscriptionMonthlyPence(input: MonthlyTotalInput): number {
  return (
    whole(input.basePence) +
    whole(input.extraSeats) * whole(input.seatPence) +
    whole(input.extraBranches) * whole(input.branchPence)
  );
}

/**
 * MRR: what a subscription is worth per month, however it is paid (2026-09-30). An Annual plan
 * pays ten months' price for twelve, so its monthly worth is the yearly price over twelve, not
 * the monthly list price: Bevan on Annual Business with one extra user is £840 a year, which is
 * £70 a month of MRR, not £84. Extras follow their own interval. Rounded to the penny.
 */
export function monthlyRecurringPence(
  input: MonthlyTotalInput & { planYearly: boolean; extrasYearly: boolean; yearlyMonthsCharged: number },
): number {
  const months = whole(input.yearlyMonthsCharged) || 12;
  const base = whole(input.basePence);
  const extras = whole(input.extraSeats) * whole(input.seatPence) + whole(input.extraBranches) * whole(input.branchPence);
  const basePerMonth = input.planYearly ? (base * months) / 12 : base;
  const extrasPerMonth = input.extrasYearly ? (extras * months) / 12 : extras;
  return Math.round(basePerMonth + extrasPerMonth);
}

/**
 * A missing or nonsense number is ZERO, never NaN.
 *
 * NaN is the dangerous failure here: it propagates silently through the addition and prints
 * as "£NaN/mo" on a page somebody is deciding whether to trust us with money on.
 */
function whole(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}
