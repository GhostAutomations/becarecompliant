/**
 * Be Care Compliant — what a TRIAL includes, and what it does not.
 *
 * PURE, no runtime imports.
 *
 * Phil, 2026-08-20: "for a trial on one branch and 2 invites should be sent, we want them to
 * trial the product and get a taster, if they want to add more seats or branches, they need to
 * sign up and commit."
 *
 * SO THIS IS THE ONE PLACE THE PRODUCT SAYS NO, and it is deliberate. Everywhere else the rule
 * is the opposite: a compliance tool must never refuse to add the manager who has to sign
 * something off (see lib/billing/seat-notice.ts).
 *
 * PHIL'S RULE, 2026-08-20, and it is the test to apply to anything like this in future:
 * **"the trial is the exception because they are not a customer yet."**
 *
 * A customer is never blocked from running their service properly, whatever the invoice ends up
 * saying. Somebody still deciding is a different case: the limit IS the offer. The moment a card
 * is on the account the limits vanish and the seat NOTICE takes over from the seat LIMIT.
 *
 * A refusal here must always name the way out, because the way out is the point.
 */

/** Branches included in a trial. */
export const TRIAL_BRANCHES = 1;

/** Invitations a trial may send, ON TOP OF the Company Admin who was set up with the account.
 *  So a trial company can have three logins: the Admin and two colleagues. */
export const TRIAL_INVITES = 2;

export type TrialLimitInput = {
  /** True only while the trial clock is running AND no subscription has been taken. */
  onTrial: boolean;
  /** Billable users who have accepted, including the Admin. */
  activeBillable: number;
  /** Billable invitations sent and not yet accepted. */
  pendingBillable: number;
};

/**
 * Why this invitation may not be sent, or null when it may.
 *
 * Counts accepted AND pending together: an invitation that has gone out is a seat promised, and
 * letting somebody send ten invitations that all land tomorrow would make the limit meaningless.
 */
export function trialInviteRefusal(input: TrialLimitInput): string | null {
  if (!input.onTrial) return null;
  const allowed = 1 + TRIAL_INVITES; // the Admin, plus two
  const taken = Math.max(0, input.activeBillable) + Math.max(0, input.pendingBillable);
  if (taken < allowed) return null;
  return (
    `A trial includes you and ${TRIAL_INVITES} colleagues, and you have used all ${allowed}. ` +
    `Add a card to invite the rest of your team — everything you have set up so far stays exactly as it is.`
  );
}

/** Why another branch may not be added, or null when it may. */
export function trialBranchRefusal(input: { onTrial: boolean; branchCount: number }): string | null {
  if (!input.onTrial) return null;
  if (input.branchCount < TRIAL_BRANCHES) return null;
  return (
    `A trial covers ${TRIAL_BRANCHES} branch. Add a card to run more than one — ` +
    `nothing already recorded is affected.`
  );
}

/**
 * The line an Admin sees while the trial is running.
 *
 * Said from the FIRST login, not three days from the end (Phil, 2026-08-20: "when an admin first
 * logins in to a founder setup company, they should be told it is a trial, and that payment
 * details are required"). A customer who discovers on day 12 that this was a trial has been
 * misled by silence, however true the small print was.
 */
export function trialNotice(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft <= 0) {
    return "Your trial has ended. Add a card to carry on — nothing has been deleted.";
  }
  const days = `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
  return (
    `You are on a free trial with ${days} left. It covers ${TRIAL_BRANCHES} branch and ` +
    `${TRIAL_INVITES} colleagues besides you. Payment details are needed to carry on afterwards ` +
    `— nothing is charged until you add them.`
  );
}
