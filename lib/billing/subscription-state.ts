/**
 * Be Care Compliant — is a Stripe subscription still there to be changed?
 *
 * PURE, with no runtime imports, so the rule is unit testable and the seat sync and the
 * branch sync cannot disagree about it.
 *
 * Written 2026-08-12. syncSeatQuantity and syncBranchQuantity both checked that a
 * subscription ID EXISTED and never that the subscription was still alive. Acme's is
 * cancelled, so every nightly reconcile would call Stripe, be refused, log
 * "[billing] branch sync failed", and report { synced: false, reason: "error" }. A dead
 * subscription is not a billing failure and must not look like one, or the one night it
 * IS a real failure nobody will notice.
 *
 * Only the TERMINAL states are treated as ended. past_due, unpaid and paused are all still
 * live subscriptions that can be modified and should keep being billed correctly, and
 * treating them as ended would quietly stop charging a customer who is merely late.
 *
 * A NULL status is deliberately NOT treated as ended: it means we have not recorded one
 * yet, and refusing to sync on unknown would leave a real subscription unbilled forever.
 * Attempting and failing is the safer way round.
 */

const ENDED = new Set(["canceled", "cancelled", "incomplete_expired"]);

export function subscriptionHasEnded(status: string | null | undefined): boolean {
  if (status == null) return false;
  return ENDED.has(status.trim().toLowerCase());
}
