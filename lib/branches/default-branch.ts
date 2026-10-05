/**
 * Be Care Compliant: which branch People compliance, Training and Service User compliance
 * open on.
 *
 * PURE, no runtime imports.
 *
 * Phil, 2026-10-05: "the initial view that they see is their primary branch ... and if she wants
 * to see Cardiff, she will then change to Cardiff." Charlotte's primary branch is Newport, so she
 * opens on Newport; Hayley's is Cardiff, so she opens on Cardiff. A Company Admin has no primary
 * branch ("single branch in alphabetical order, so for thistle as i am admin i would see
 * cardiff"), and nor does anybody whose primary branch has been closed or removed from them, so
 * they open on the first operational branch by name.
 *
 * A branch named in the link (?branch=) always wins: that is a deliberate choice, from a
 * dashboard tile or a back link, not a default.
 */

export type DefaultableBranch = { id: string; name: string; kind?: string | null };

/** An operational branch, not the office. A list without kinds (the Service User list is
 *  already branches only) counts every row as operational. */
function operational(b: DefaultableBranch): boolean {
  return b.kind == null || b.kind === "branch";
}

/**
 * The branch to open on.
 *
 * - `requested` (from the link) when it is one the viewer can see;
 * - otherwise the viewer's primary branch when it is one they can see;
 * - otherwise the first operational branch alphabetically;
 * - otherwise "" (nothing to choose, which every picker already handles).
 */
export function pickDefaultBranch(
  branches: DefaultableBranch[],
  primaryBranchId: string | null,
  requested?: string | null,
): string {
  if (requested && branches.some((b) => b.id === requested)) return requested;
  if (primaryBranchId && branches.some((b) => b.id === primaryBranchId && operational(b))) {
    return primaryBranchId;
  }
  const first = branches
    .filter(operational)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.id.localeCompare(b.id))[0];
  return first?.id ?? "";
}
