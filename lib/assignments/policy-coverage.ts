/**
 * Be Care Compliant — is everybody on the CURRENT version of the policies they were sent?
 *
 * THE LIST item 20. Pure and isomorphic so the counting rule can be unit tested, which is
 * the whole reason this file exists separately from the fetching.
 *
 * THE MISTAKE THIS FILE FIXES, found live on 2026-08-11. The first version counted
 * ASSIGNMENTS. That is not the question. A policy is re-sent every time it is re-published,
 * and a manager testing it re-sends it by hand, so one person can hold five assignment rows
 * for one policy: two at version 1 and three at version 2. Counting rows reported "66%, two
 * people behind" and named the SAME person twice, when she had signed version 2 three times
 * over and was completely up to date.
 *
 * The unit is therefore ONE PERSON AND ONE POLICY, and their position on it is the HIGHEST
 * version they have ever signed. That is what an inspector is asking: has this person read
 * the wording that is in force, not how many envelopes were sent.
 *
 * Cancelled assignments are dropped entirely: a withdrawn instruction is not an obligation,
 * and a pair whose only assignment was cancelled is not counted against the company at all.
 */

export type PolicyAssignmentRow = {
  personId: string;
  personName: string;
  policyId: string;
  status: string;
  /** The version of the policy that this assignment was for. */
  policyVersion: number | null;
};

export type ActivePolicy = { id: string; title: string; version: number };

export type PolicyBehind = {
  personId: string;
  personName: string;
  policyId: string;
  policyTitle: string;
  currentVersion: number;
  /** The newest version they have signed, or null when they have never completed it. */
  signedVersion: number | null;
};

export type PolicyCoverage = {
  /** Person and policy pairs with a live obligation. */
  assigned: number;
  upToDate: number;
  /** Floored to one decimal like every other percentage here. Null when nothing is assigned,
   *  because 0% reads as a failure rather than "nothing has been sent yet". */
  pct: number | null;
  behind: PolicyBehind[];
};

export function summarisePolicyCoverage(
  rows: PolicyAssignmentRow[],
  policies: ActivePolicy[],
): PolicyCoverage {
  const active = new Map(policies.map((p) => [p.id, p]));

  // key: personId + policyId. Value: the best position that pair has reached.
  const pairs = new Map<string, { row: PolicyAssignmentRow; signedVersion: number | null }>();

  for (const row of rows) {
    if (!active.has(row.policyId)) continue; // archived policy: nobody must be up to date on it
    if (row.status === "cancelled") continue; // withdrawn, so not an obligation
    const key = `${row.personId}::${row.policyId}`;
    const signed = row.status === "completed" ? (row.policyVersion ?? null) : null;
    const held = pairs.get(key);
    if (!held) {
      pairs.set(key, { row, signedVersion: signed });
      continue;
    }
    // Keep the HIGHEST signed version across every assignment of this policy to this person.
    if (signed !== null && (held.signedVersion === null || signed > held.signedVersion)) {
      pairs.set(key, { row, signedVersion: signed });
    }
  }

  let upToDate = 0;
  const behind: PolicyBehind[] = [];

  for (const { row, signedVersion } of pairs.values()) {
    const policy = active.get(row.policyId)!;
    if (signedVersion !== null && signedVersion >= policy.version) {
      upToDate += 1;
      continue;
    }
    behind.push({
      personId: row.personId,
      personName: row.personName,
      policyId: row.policyId,
      policyTitle: policy.title,
      currentVersion: policy.version,
      signedVersion,
    });
  }

  // Somebody who signed an OLD version comes first: they are the dangerous case, because
  // every other screen shows their policy as completed, and it is, just not the current
  // wording. Never signed at all is at least obvious from the Briefings list.
  behind.sort((a, b) => {
    if ((a.signedVersion === null) !== (b.signedVersion === null)) {
      return a.signedVersion === null ? 1 : -1;
    }
    return a.personName.localeCompare(b.personName) || a.policyTitle.localeCompare(b.policyTitle);
  });

  const assigned = pairs.size;
  return {
    assigned,
    upToDate,
    pct: assigned === 0 ? null : Math.floor((upToDate / assigned) * 1000) / 10,
    behind,
  };
}
