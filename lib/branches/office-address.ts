/**
 * Be Care Compliant — where a branch's post actually goes.
 *
 * Most agencies run every branch out of one office: Thistle has Cardiff and Newport
 * because it cares for people in those areas, not because it has premises there. A
 * branch like that INHERITS the office address rather than storing its own copy —
 * copy the text into each branch and the day the company moves you have one right
 * address and two silently wrong ones on formal letters.
 *
 * Pure and self-contained (no runtime imports) so it can be unit tested.
 */

export type BranchKind = "team" | "branch";

export type BranchAddressRow = {
  id: string;
  name: string;
  kind: BranchKind;
  address: string | null;
  uses_office_address: boolean;
};

/** The company's own office: the Team branch. There is exactly one. */
export function officeAddress(rows: readonly BranchAddressRow[]): string | null {
  const office = rows.find((b) => b.kind === "team");
  const addr = office?.address?.trim();
  return addr ? addr : null;
}

/**
 * The address to use for this branch, and whether it came from the office.
 * A branch only inherits when it is set to; the office never inherits from itself.
 */
export function resolveBranchAddress(
  branch: Pick<BranchAddressRow, "kind" | "address" | "uses_office_address">,
  office: string | null,
): { address: string | null; inherited: boolean } {
  if (branch.kind !== "team" && branch.uses_office_address) {
    return { address: office, inherited: true };
  }
  const own = branch.address?.trim();
  return { address: own ? own : null, inherited: false };
}

export type MeetingPlace = {
  id: string;
  label: string;
  address: string | null;
  hasAddress: boolean;
};

/**
 * The DISTINCT places a formal meeting can be held. A branch that shares the office
 * is not offered separately: three options that are all the same building is three
 * ways to say one thing on a letter. A branch with its own premises is always
 * offered, even before its address is filled in, so it can be seen and fixed.
 */
export function meetingPlaces(
  rows: readonly BranchAddressRow[],
  companyName: string,
): MeetingPlace[] {
  const office = officeAddress(rows);
  const places: MeetingPlace[] = [];

  for (const b of rows) {
    if (b.kind === "team") {
      places.push({
        id: b.id,
        label: `${companyName} Office`,
        address: office,
        hasAddress: office !== null,
      });
    }
  }

  const branches = rows
    .filter((b) => b.kind !== "team" && !b.uses_office_address)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const b of branches) {
    const { address } = resolveBranchAddress(b, office);
    places.push({
      id: b.id,
      label: `${b.name} Branch Office`,
      address,
      hasAddress: address !== null,
    });
  }

  return places;
}
