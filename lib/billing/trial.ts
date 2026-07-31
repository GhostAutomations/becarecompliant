/**
 * The 14 day trial, as a pure function (Phase 10 Additions, item 4c).
 *
 * No imports at all, so it is unit tested by node --test with the rest of lib and can be
 * called from a page, a layout, a guard or an API route without dragging server code with
 * it. The database read lives next door in trial-gate.ts.
 *
 * WHAT DECIDES A LOCK. companies.trial_ends_at, and nothing else. A company that never had
 * a trial has NULL there and can never be locked, which is every company that existed
 * before migration 0152. When a company subscribes, the Stripe webhook clears
 * trial_ends_at, so a paying company is in exactly the same position as one that never had
 * a trial. That is deliberate: reading the subscription instead would mean reading
 * company_billing, and its RLS admits only a Company Admin and the founder, so a Manager
 * would see no row and be locked out of a company his Admin can use perfectly well. One
 * column, readable by every member, cannot go wrong that way.
 *
 * Absolute time, not civil dates. A trial is a fixed length from the moment it was granted,
 * so "three days left" is 72 hours, not three calendar boxes, and no timezone comes into it.
 */

/** How many days out the warning banner starts. */
export const TRIAL_WARNING_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialStatus =
  /** Not on a trial: never had one, or has subscribed. Nothing to show, nothing to lock. */
  | "none"
  | "trialing"
  /** Still working, but inside the warning window. */
  | "ending_soon"
  /** Over. Everything except the billing path is closed. */
  | "expired";

export type TrialState = {
  status: TrialStatus;
  /** Whole days remaining, rounded up, so a trial with an hour left says 1 rather than 0.
   *  Null when there is no trial, 0 once it has expired. */
  daysLeft: number | null;
  endsAt: string | null;
};

/** Tiers that are granted by hand and are never on a trial clock. */
/**
 * Tiers that are never on a trial clock.
 *
 * "black" is the live one: a free, founder granted account has nothing to convert to. "diamond"
 * is retired (31 Jul 2026) and is kept here deliberately, not tidied away: if a row anywhere
 * still carried it, dropping it from this list would put a free account on an expired trial and
 * lock it out of everything but Billing.
 */
const NEVER_TRIALED = ["black", "diamond"];

export function trialState(
  input: { trialEndsAt: string | null | undefined; tier?: string | null },
  now: Date = new Date(),
): TrialState {
  const tier = (input.tier ?? "").toLowerCase();
  if (NEVER_TRIALED.includes(tier)) {
    return { status: "none", daysLeft: null, endsAt: null };
  }

  const raw = input.trialEndsAt;
  if (!raw) return { status: "none", daysLeft: null, endsAt: null };

  const ends = new Date(raw);
  const time = ends.getTime();
  // An unparseable date must never lock anybody out of their own records.
  if (!Number.isFinite(time)) return { status: "none", daysLeft: null, endsAt: null };

  const remaining = time - now.getTime();
  if (remaining <= 0) return { status: "expired", daysLeft: 0, endsAt: raw };

  const daysLeft = Math.ceil(remaining / DAY_MS);
  return {
    status: daysLeft <= TRIAL_WARNING_DAYS ? "ending_soon" : "trialing",
    daysLeft,
    endsAt: raw,
  };
}

/** "1 day left" / "6 days left". Shared so the banner and the locked screen agree. */
export function trialDaysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft <= 0) return "Trial ended";
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
}
