/**
 * Be Care Compliant — the rules for deleting a company.
 *
 * PURE, and no runtime imports, so the unit tests can load it under
 * `node --experimental-strip-types` (see the note in lib/billing/tier-change.ts).
 *
 * Deleting a company is the one act in this product that cannot be undone by pressing the
 * other button, so the rules that decide whether it may happen at all live apart from the
 * code that carries it out. lib/companies/delete-apply.ts is the implementation; this file is
 * what it is allowed to do.
 *
 * The shape agreed with Phil on 2026-08-18:
 *   * Stage one hides the company, locks its logins out and cancels Stripe immediately.
 *   * Stage two, thirty days later or on demand, erases it: rows, files, logins, audit trail.
 *   * One tombstone row survives (public.company_deletions), so an erasure request is
 *     genuinely satisfied while the deletion can still be proved and accounted for.
 */

/** How long a deleted company sits recoverable before it is erased for real. */
export const GRACE_DAYS = 30;

export type CompanyStatus = "active" | "suspended" | "archived" | "deleted";

/**
 * Is this company locked out of the product?
 *
 * Every status other than 'active' locks. That is a CHANGE, and a deliberate one: until
 * 2026-08-18 nothing anywhere read companies.status, so "Suspend" in the founder console
 * moved a word on a screen and the suspended company's staff carried on working as though
 * nothing had happened. A control that says it cuts off access and does not is worse than no
 * control, because somebody relies on it.
 */
export function companyIsLocked(status: string | null | undefined): boolean {
  return (status ?? "active") !== "active";
}

/** The date a company deleted now becomes eligible to be purged. */
export function purgeAfterFrom(deletedAtISO: string, graceDays: number = GRACE_DAYS): string {
  const t = new Date(deletedAtISO).getTime();
  if (!Number.isFinite(t)) throw new Error("purgeAfterFrom: invalid date");
  return new Date(t + graceDays * 24 * 60 * 60 * 1000).toISOString();
}

/** Is a deleted company past its grace period? A missing or unreadable date is NOT due:
 *  the failure direction of a purge has to be "wait", never "erase". */
export function purgeIsDue(purgeAfterISO: string | null | undefined, nowISO: string): boolean {
  if (!purgeAfterISO) return false;
  const due = new Date(purgeAfterISO).getTime();
  const now = new Date(nowISO).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(now)) return false;
  return now >= due;
}

/** Whole days left before the purge, floored at zero. For the founder screen, not for logic. */
export function daysUntilPurge(purgeAfterISO: string | null | undefined, nowISO: string): number {
  if (!purgeAfterISO) return 0;
  const due = new Date(purgeAfterISO).getTime();
  const now = new Date(nowISO).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((due - now) / (24 * 60 * 60 * 1000)));
}

export type DeleteRequest = {
  /** What the founder typed into the confirmation box. */
  typedName: string;
  /** The company's actual name. */
  companyName: string;
  /** Its status right now. */
  status: string | null | undefined;
  /** True when the person pressing the button is the platform admin. */
  isFounder: boolean;
};

/**
 * Why this deletion may NOT go ahead, or null when it may.
 *
 * Returns a refusal a person can act on rather than throwing, because every caller puts it
 * straight in front of somebody.
 */
export function deleteRefusal(req: DeleteRequest): string | null {
  if (!req.isFounder) return "Only the founder can delete a company.";
  if (!req.companyName.trim()) return "That company no longer exists.";
  if ((req.status ?? "active") === "deleted") {
    return "That company is already deleted and waiting to be purged.";
  }
  if (normalise(req.typedName) !== normalise(req.companyName)) {
    return `Type the company's name exactly — "${req.companyName}" — to confirm.`;
  }
  return null;
}

/** Why a restore may not go ahead, or null when it may. */
export function restoreRefusal(input: {
  status: string | null | undefined;
  purgedAt: string | null | undefined;
  isFounder: boolean;
}): string | null {
  if (!input.isFounder) return "Only the founder can restore a company.";
  if (input.purgedAt) {
    // Nothing to bring back. Saying so plainly beats a button that appears to work.
    return "That company has already been purged. Nothing of it remains to restore.";
  }
  if ((input.status ?? "active") !== "deleted") return "That company is not deleted.";
  return null;
}

/**
 * Why a purge may not go ahead, or null when it may.
 *
 * `force` is the founder pressing "Purge now" on a company already deleted — it skips the
 * clock, never the deletion itself. There is deliberately no path that purges a company that
 * was not deleted first: the grace period is what makes a mis-click survivable.
 */
export function purgeRefusal(input: {
  status: string | null | undefined;
  purgeAfter: string | null | undefined;
  purgedAt: string | null | undefined;
  nowISO: string;
  force: boolean;
}): string | null {
  if ((input.status ?? "active") !== "deleted") {
    return "Only a deleted company can be purged. Delete it first.";
  }
  if (input.purgedAt) return "That company has already been purged.";
  if (!input.force && !purgeIsDue(input.purgeAfter, input.nowISO)) {
    const left = daysUntilPurge(input.purgeAfter, input.nowISO);
    return `Not due yet: ${left} day${left === 1 ? "" : "s"} of the grace period left.`;
  }
  return null;
}

function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The plain-English line the founder screen shows about what deleting will do. */
export function deletionWarning(companyName: string, graceDays: number = GRACE_DAYS): string {
  return (
    `${companyName} disappears from the product immediately, every one of its logins stops ` +
    `working, and any live subscription is cancelled there and then with no refund. ` +
    `Nothing is erased for ${graceDays} days — until then it can be restored, though the ` +
    `subscription will not come back. After that its records, files, logins and audit trail ` +
    `are erased for good, leaving only a record that the deletion happened.`
  );
}
