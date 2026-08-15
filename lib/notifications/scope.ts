/**
 * Be Care Compliant - WHOSE PROBLEM IS THIS ITEM. Pure, and deliberately IMPORTLESS.
 *
 * Split out of lib/notifications/digest.ts so it can be tested. digest.ts imports
 * "@/lib/recurrence", and a single aliased import makes a file unrunnable under
 * `node --experimental-strip-types --test`. The decision below had no test, and that is a large
 * part of why it was wrong for a month without anybody noticing.
 *
 * THE DEFECT THIS FIXES (found 2026-08-14, shipped some time before).
 *
 * A Supervisor's daily digest was ALWAYS EMPTY. Scoping read `person_assignments` and
 * `service_user_assignments`, the caseload tables, and picked out the items whose record id
 * appeared there. Migration 0078 had already made a Supervisor BRANCH based:
 *
 *   "A Supervisor now sees and can complete/edit everything in THEIR BRANCH, not just an
 *    assigned caseload ... person_assignments is left in place but no longer restricts a
 *    supervisor's visibility."
 *
 * Nothing writes to those tables any more. Both hold zero rows. So every Supervisor was scoped
 * to an empty set, `buildDigests` drops a recipient with nothing to report, and the email simply
 * never arrived. Not an error, not a warning: silence, which is the worst possible failure for a
 * chasing email, because an inbox with nothing in it looks exactly like a company with nothing
 * overdue.
 *
 * A Supervisor is therefore scoped EXACTLY like a Manager, by branch, which is what the database
 * already believes. One rule, in one place, agreeing with RLS.
 */

/** Just enough of a recipient to decide scope. Structural on purpose: no imports. */
export type ScopeRecipient = {
  /** Registered roles are normalised to company_admin before they reach here. */
  role: "company_admin" | "manager" | "supervisor";
  branchIds: string[];
};

/** Just enough of an item. Anything with a branch can be scoped. */
export type ScopeItem = { branchId: string | null };

/**
 * The slice of a company's items one recipient is responsible for.
 *
 * An item with NO branch is deliberately dropped for anyone but an Admin. It cannot be matched
 * to a branch, so handing it to a branch scoped recipient would be a guess, and a guess in a
 * compliance email is worse than an omission an Admin will still see.
 */
export function scopeItems<T extends ScopeItem>(recipient: ScopeRecipient, items: T[]): T[] {
  if (recipient.role === "company_admin") return items;
  // Managers AND Supervisors: their branches. See the header for why these are now the same.
  const branches = new Set(recipient.branchIds);
  return items.filter((i) => i.branchId !== null && branches.has(i.branchId));
}
