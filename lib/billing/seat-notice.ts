/**
 * Be Care Compliant — what the next invite will cost, said before it is sent.
 *
 * PURE, no runtime imports, so both the screen and its tests can use it.
 *
 * WHY IT EXISTS (Phil, 2026-08-20). He added six office users to a Business tenant that
 * includes four, on top of two branches where one is included, **and nothing anywhere said a
 * word**. There is no seat gate in the product — by design, a compliance tool must never refuse
 * to add the manager who has to sign things off — but "we will not stop you" is not the same as
 * "we will not tell you". The figures existed on Settings > Billing and nowhere else, so the
 * only way to find out was to go looking for a page you had no reason to open.
 *
 * The honest sentence is about what happens WHEN THE INVITES ARE ACCEPTED, because seats are
 * counted on ACTIVE users. Saying "this is your fifth user" the moment somebody is invited is
 * wrong: they may never accept, and nothing is charged for an invitation.
 */

export type SeatNoticeInput = {
  /** Billable users who have accepted and are active. */
  activeUsers: number;
  /** Billable invitations sent and not yet accepted. */
  pendingInvites: number;
  /** Included with this tier. */
  included: number;
  /** Pence per extra user per month. */
  extraSeatPence: number;
  /** False when there is no live subscription at all. */
  hasSubscription: boolean;
};

export type SeatNotice = {
  /** True when something is worth saying. */
  show: boolean;
  /** Extra seats being paid for right now. */
  extraNow: number;
  /** Extra seats once every pending invitation is accepted. */
  extraWhenAccepted: number;
  /** The monthly cost of those, in pence. */
  costWhenAcceptedPence: number;
  /** One sentence, ready to render. Empty when show is false. */
  message: string;
};

export function seatNotice(input: SeatNoticeInput): SeatNotice {
  const active = Math.max(0, Math.trunc(input.activeUsers));
  const pending = Math.max(0, Math.trunc(input.pendingInvites));
  const included = Math.max(0, Math.trunc(input.included));

  const extraNow = Math.max(0, active - included);
  const extraWhenAccepted = Math.max(0, active + pending - included);
  const costWhenAcceptedPence = extraWhenAccepted * input.extraSeatPence;

  if (extraWhenAccepted === 0) {
    return { show: false, extraNow, extraWhenAccepted, costWhenAcceptedPence, message: "" };
  }

  const money = `£${(costWhenAcceptedPence / 100).toFixed(2)}`;
  const seats = `${extraWhenAccepted} extra ${extraWhenAccepted === 1 ? "user" : "users"}`;

  /* Three genuinely different situations, and rolling them into one sentence is how a screen
     ends up saying something untrue about somebody's bill. */
  if (!input.hasSubscription) {
    return {
      show: true,
      extraNow,
      extraWhenAccepted,
      costWhenAcceptedPence,
      message:
        `Your plan includes ${included} users. ` +
        (pending > 0
          ? `With ${active} active and ${pending} invited, that is ${seats} once everyone accepts`
          : `You have ${active}, which is ${seats}`) +
        `, and ${money} a month. Billing is not set up yet, so nothing is being charged.`,
    };
  }

  if (pending > 0 && extraWhenAccepted > extraNow) {
    return {
      show: true,
      extraNow,
      extraWhenAccepted,
      costWhenAcceptedPence,
      message:
        `Your plan includes ${included} users. With ${active} active and ${pending} invited, ` +
        `you will be paying for ${seats} — ${money} a month — once everyone has accepted.`,
    };
  }

  return {
    show: true,
    extraNow,
    extraWhenAccepted,
    costWhenAcceptedPence,
    message:
      `Your plan includes ${included} users and you have ${active}, so you are paying for ` +
      `${seats}: ${money} a month.`,
  };
}
