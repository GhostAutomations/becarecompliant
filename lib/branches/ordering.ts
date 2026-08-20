/**
 * Be Care Compliant — the order branches appear in, and which one is the free one.
 *
 * PURE, no runtime imports.
 *
 * Phil, 2026-08-20: "put office team at the top, then the included branch, then any
 * chargeble branches."
 *
 * Alphabetical-by-kind was an accident of an old `.order()` call, and it buried the office
 * under the branches — "branch" happens to sort before "team". The office is the company's
 * own base and every other screen treats it as the anchor, so it goes first.
 *
 * THE PART THAT IS A REAL DECISION, not cosmetics: nothing in the product had ever said WHICH
 * operational branch is the one the tier includes. Billing only ever counted them
 * (`extraBranchesFor` = count - included), which is correct on the invoice but useless on a
 * screen — a customer cannot see what they are paying £7.50 for.
 *
 * The rule here is OLDEST FIRST: the branch they have had longest is the included one, and the
 * ones they opened later are the chargeable ones. That is the only ordering where opening a new
 * branch never silently reclassifies a branch they already had, and it matches how anybody
 * would describe it out loud — "we added Newport, so Newport is the extra one".
 *
 * Ties are broken by name then id, because a company provisioned in one go (office + first
 * branch) has rows with identical timestamps, and an unstable order on a billing label is not
 * something to leave to chance.
 */

/** What a row costs, which is what the screen needs to say. */
export type BranchBilling = "office" | "included" | "chargeable";

export type OrderableBranch = {
  id: string;
  name: string;
  kind: string;
  created_at: string;
};

export type OrderedBranch<T> = T & { billing: BranchBilling };

/** The office is anything that is not an operational branch. Only kind === "branch" is billable,
 *  which is the same test the founder console and the dashboard already apply. */
export function isOperational(kind: string): boolean {
  return kind === "branch";
}

function oldestFirst(a: OrderableBranch, b: OrderableBranch): number {
  const at = Date.parse(a.created_at);
  const bt = Date.parse(b.created_at);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/**
 * Office first, then the included branch(es) oldest first, then the chargeable ones.
 *
 * `includedBranches` comes from the tier (Business 1, Pro 2, Black effectively unlimited), so on
 * Black nothing is ever labelled chargeable — which is right, because nothing is.
 */
export function orderBranches<T extends OrderableBranch>(
  rows: readonly T[],
  includedBranches: number,
): OrderedBranch<T>[] {
  const included = Math.max(0, Math.trunc(includedBranches));

  const offices = rows.filter((r) => !isOperational(r.kind)).slice().sort(oldestFirst);
  const branches = rows.filter((r) => isOperational(r.kind)).slice().sort(oldestFirst);

  return [
    ...offices.map((r) => ({ ...r, billing: "office" as const })),
    ...branches.map((r, i) => ({
      ...r,
      billing: (i < included ? "included" : "chargeable") as BranchBilling,
    })),
  ];
}

/** How many of these rows are being charged for. Kept here so the screen and the invoice cannot
 *  drift: this counts the SAME rows the labels came from. */
export function chargeableCount(ordered: readonly { billing: BranchBilling }[]): number {
  return ordered.filter((r) => r.billing === "chargeable").length;
}
