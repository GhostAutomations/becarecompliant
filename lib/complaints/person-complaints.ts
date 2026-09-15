/**
 * Be Care Compliant — complaints about a team member, counted fairly.
 *
 * Phil, 2026-09-15: a tile on the person's record showing how many complaints they have had,
 * which opens THEIR complaints and not the company's.
 *
 * THE COUNT IS NEVER A BARE NUMBER. A complaint investigated and NOT upheld still shows,
 * because five dismissed complaints is a pattern somebody should see, but it is always shown
 * alongside how many were actually upheld. A care worker cleared three times must not read
 * worse than one nobody ever complained about, and a number that hides its outcomes is the
 * kind of thing that gets challenged at a tribunal.
 *
 * `upheld` is null until somebody decides. Null is NOT "not upheld": an open complaint has no
 * finding yet, and counting it as cleared would be as wrong as counting it as proven. So
 * there are three buckets and the wording says which is which.
 *
 * Pure and isomorphic, so the tile, the list and any report ask the same function.
 */

export type PersonComplaintCounts = {
  total: number;
  upheld: number;
  notUpheld: number;
  /** Raised, but nobody has recorded a finding yet. */
  undecided: number;
};

export function countForPerson(
  /* `undefined` is accepted alongside null and means the same thing: nobody has decided.
     A complaint logged before the finding was recordable must not read as cleared. */
  complaints: ReadonlyArray<{ upheld?: boolean | null }>,
): PersonComplaintCounts {
  let upheld = 0;
  let notUpheld = 0;
  let undecided = 0;
  for (const c of complaints) {
    if (c.upheld === true) upheld += 1;
    else if (c.upheld === false) notUpheld += 1;
    else undecided += 1;
  }
  return { total: complaints.length, upheld, notUpheld, undecided };
}

/**
 * The tile's sentence. Says the outcome in the same breath as the number, always.
 *
 * Deliberately NOT "0 complaints": a person with none gets "No complaints", because a zero
 * in a counter still reads as a score, and there is nothing being scored here.
 */
export function describeCounts(counts: PersonComplaintCounts): string {
  if (counts.total === 0) return "No complaints";
  const parts: string[] = [];
  if (counts.upheld > 0) parts.push(`${counts.upheld} upheld`);
  if (counts.notUpheld > 0) parts.push(`${counts.notUpheld} not upheld`);
  if (counts.undecided > 0) parts.push(`${counts.undecided} still open`);
  return parts.join(", ");
}

/**
 * How the tile should read on a compliance screen.
 *
 * Driven by UPHELD complaints only. An open complaint is not yet a finding and a dismissed
 * one is not a mark, so neither colours the tile: being complained about is not the same as
 * having done something wrong, and the tile must not imply otherwise.
 */
export function ragForCounts(counts: PersonComplaintCounts): "none" | "amber" | "red" {
  if (counts.upheld >= 2) return "red";
  if (counts.upheld === 1) return "amber";
  return "none";
}
