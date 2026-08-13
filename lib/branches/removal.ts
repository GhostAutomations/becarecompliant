/**
 * Be Care Compliant — the sentence a founder reads when a branch cannot be removed.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so it is unit testable.
 *
 * Removing a branch is an UNDO for one created by mistake, never a way to erase history:
 * migration 0181 refuses while anything at all references it. This turns the database\'s
 * answer into something a person can act on \u2014 what is in the way, and how much of it.
 */

export type Blocker = { what: string; n: number };

export type RemovalResult = {
  removed?: boolean;
  reason?: string | null;
  blocked_by?: Blocker[] | null;
  name?: string | null;
};

/** The three or fewer biggest blockers, spelled out: "21 people, 19 planner bookings and 7
 *  Regulation 80 reviews". Three because a list of seventeen is not read, it is skimmed. */
export function describeBlockers(blockers: Blocker[] | null | undefined): string {
  const rows = (blockers ?? [])
    .filter((b) => b && typeof b.what === "string" && Number.isFinite(b.n) && b.n > 0)
    .slice(0, 3)
    .map((b) => `${Math.trunc(b.n)} ${b.what}`);
  if (rows.length === 0) return "";
  if (rows.length === 1) return rows[0];
  return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}

/**
 * Null when the removal succeeded; otherwise the refusal to show.
 *
 * Every branch is named, because a founder console lists several and "that branch is in use"
 * would not say which.
 */
export function removalRefusal(result: RemovalResult | null | undefined): string | null {
  if (!result) return "Could not remove the branch. Please try again.";
  if (result.removed) return null;

  const name = (result.name ?? "").trim() || "That branch";

  switch (result.reason) {
    case "not_permitted":
      return "Only the founder account can remove a branch.";
    case "not_found":
      return "That branch no longer exists.";
    case "not_a_branch":
      // The office row holds head office records. Removing it would leave them nowhere.
      return `${name} is the company\'s office, not a branch, so it cannot be removed.`;
    case "in_use": {
      const list = describeBlockers(result.blocked_by);
      const detail = list ? ` It still has ${list}.` : "";
      return `${name} has records against it, so it cannot be removed.${detail} Move them to another branch first.`;
    }
    default:
      return "Could not remove the branch. Please try again.";
  }
}
