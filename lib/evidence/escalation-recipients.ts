/**
 * Be Care Compliant — who "the branch manager" actually is.
 *
 * A form that says "tick this box if it needs escalating to the branch manager" has to
 * be able to name one. This is the rule, kept pure so it can be tested, because the one
 * outcome that must never happen is an escalation that quietly goes to nobody.
 *
 * The order is deliberate:
 *   1. Active managers assigned to that branch. The branch manager, literally.
 *   2. Failing that, the people whose authority is the whole company — the registered
 *      manager, the registered individual, the company admin.
 *
 * Never both: a branch with its own manager does not need the registered individual
 * copied into every escalation, and an escalation that goes to eight people is one
 * everybody assumes somebody else picked up. The fallback exists so a branch with no
 * manager assigned still reaches a human, which is the whole point.
 */

export type Recipient = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string | null;
  /** True when this profile is assigned to the branch in question. */
  inBranch: boolean;
};

/** Roles whose reach is the whole company, so they are the fallback when a branch has
 *  no manager of its own. Mirrors is_company_wide in the RLS policies. */
const COMPANY_WIDE = new Set(["company_admin", "registered_individual", "registered_manager"]);

function usable(p: Recipient): boolean {
  return (p.status ?? "active") === "active" && !!(p.email ?? "").trim();
}

/**
 * Pick who an escalation goes to. Returns email addresses, de-duplicated, in a stable
 * order. An empty array means there was nobody to tell, which the caller must SAY rather
 * than swallow.
 */
export function escalationRecipients(candidates: ReadonlyArray<Recipient>): Recipient[] {
  const live = candidates.filter(usable);

  const branchManagers = live.filter((p) => p.role === "manager" && p.inBranch);
  const chosen = branchManagers.length > 0 ? branchManagers : live.filter((p) => COMPANY_WIDE.has(p.role));

  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const p of chosen) {
    const key = (p.email ?? "").trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
